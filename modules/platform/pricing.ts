/**
 * Store default markups and the products that override them.
 * Saving a default does not reprice the catalog. A cost change still has to
 * clear the existing margin guard before a price is written.
 */

import { AppError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { loadSyncPolicy, markupSideFromColumns, type MarkupKind } from '@/modules/supplier/markup-rules';

export type PricingOverride = {
  readonly id: string;
  readonly title: string;
  readonly wholesaleKind: MarkupKind;
  readonly wholesaleValue: string;
  readonly retailKind: MarkupKind;
  readonly retailValue: string;
};

export type PricingPage = {
  readonly wholesaleKind: MarkupKind;
  readonly wholesaleValue: string;
  readonly retailKind: MarkupKind;
  readonly retailValue: string;
  readonly minMarginPercent: number;
  readonly overrides: readonly PricingOverride[];
  readonly attentionCount: number;
};

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) throw new AppError('PRICING_READ_FAILED', result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

function sideValue(kind: MarkupKind, percent: number | null, minor: bigint | null): string {
  if (kind === 'fixed') {
    const value = minor ?? 0n;
    const whole = value / 1_000_000n;
    const frac = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : String(whole);
  }
  return String(percent ?? 0);
}

export async function readPricing(db: DbClient): Promise<PricingPage> {
  const policy = await loadSyncPolicy(db);
  const products = records((await db.from('products').select('id, title, status, stock_unlimited, stock_count, wholesale_markup_kind, wholesale_markup_percent, wholesale_markup_minor, retail_markup_kind, retail_markup_percent, retail_markup_minor').limit(1000)) as QueryResult<unknown>);
  const overrides: PricingOverride[] = [];
  let attention = 0;
  for (const row of products) {
    if (text(row.status) === 'archived') continue;
    if (row.stock_unlimited === false && (typeof row.stock_count !== 'number' || row.stock_count <= 10)) attention += 1;
    const wholesale = markupSideFromColumns(text(row.wholesale_markup_kind), row.wholesale_markup_percent as string | number | null, row.wholesale_markup_minor as string | number | null);
    const retail = markupSideFromColumns(text(row.retail_markup_kind), row.retail_markup_percent as string | number | null, row.retail_markup_minor as string | number | null);
    const wholesaleDiffers = wholesale !== null && (wholesale.kind !== policy.wholesale.kind || wholesale.percent !== policy.wholesale.percent || wholesale.minor !== policy.wholesale.minor);
    const retailDiffers = retail !== null && (retail.kind !== policy.retail.kind || retail.percent !== policy.retail.percent || retail.minor !== policy.retail.minor);
    if (!wholesaleDiffers && !retailDiffers) continue;
    overrides.push({
      id: text(row.id),
      title: text(row.title) || text(row.id),
      wholesaleKind: wholesale?.kind ?? policy.wholesale.kind,
      wholesaleValue: sideValue(wholesale?.kind ?? policy.wholesale.kind, wholesale?.percent ?? policy.wholesale.percent, wholesale?.minor ?? policy.wholesale.minor),
      retailKind: retail?.kind ?? policy.retail.kind,
      retailValue: sideValue(retail?.kind ?? policy.retail.kind, retail?.percent ?? policy.retail.percent, retail?.minor ?? policy.retail.minor),
    });
  }
  return {
    wholesaleKind: policy.wholesale.kind,
    wholesaleValue: sideValue(policy.wholesale.kind, policy.wholesale.percent, policy.wholesale.minor),
    retailKind: policy.retail.kind,
    retailValue: sideValue(policy.retail.kind, policy.retail.percent, policy.retail.minor),
    minMarginPercent: policy.minMarginPercent,
    overrides,
    attentionCount: attention,
  };
}

export async function savePricingDefaults(
  db: DbClient,
  input: {
    readonly wholesaleKind: MarkupKind;
    readonly wholesaleValue: string;
    readonly retailKind: MarkupKind;
    readonly retailValue: string;
  },
): Promise<PricingPage> {
  const current = (await db.from('platform_settings').select('id').limit(1).maybeSingle()) as QueryResult<Record<string, unknown> | null>;
  if (current.error || !current.data || typeof current.data.id !== 'string') {
    throw new AppError('PRICING_SAVE_FAILED', current.error?.message ?? 'Store settings are missing.', 500);
  }
  const wholesaleMinor = input.wholesaleKind === 'fixed' ? input.wholesaleValue : null;
  const retailMinor = input.retailKind === 'fixed' ? input.retailValue : null;
  const patch: Record<string, string | number | null> = {
    default_wholesale_markup_kind: input.wholesaleKind,
    default_wholesale_markup_percent: input.wholesaleKind === 'percent' ? Number(input.wholesaleValue) : null,
    default_wholesale_markup_minor: wholesaleMinor,
    default_retail_markup_kind: input.retailKind,
    default_retail_markup_percent: input.retailKind === 'percent' ? Number(input.retailValue) : null,
    default_retail_markup_minor: retailMinor,
  };
  if (input.wholesaleKind === 'percent') patch.default_markup_percent = Number(input.wholesaleValue);
  const saved = (await db.from('platform_settings').update(patch).eq('id', current.data.id)) as QueryResult<unknown>;
  if (saved.error) throw new AppError('PRICING_SAVE_FAILED', saved.error.message, 500);
  return readPricing(db);
}
