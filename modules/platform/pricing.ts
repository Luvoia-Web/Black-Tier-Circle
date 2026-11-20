/**
 * Store default markups and the products that override them.
 * Saving a default does not reprice the catalog. A cost change still has to
 * clear the existing margin guard before a price is written.
 */

import { AppError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { REORDER_POINT } from '@/modules/platform/inventory';
import { loadSyncPolicy, marginBelowMinimum, markupSideFromColumns, priceWithRule, type MarkupKind, type MarkupSide, type SyncPolicy } from '@/modules/supplier/markup-rules';

export type PricingOverride = {
  readonly id: string;
  readonly title: string;
  readonly wholesaleKind: MarkupKind;
  readonly wholesaleValue: string;
  readonly retailKind: MarkupKind;
  readonly retailValue: string;
};

export type PricingPreview = {
  readonly id: string;
  readonly title: string;
  readonly fromWholesale: string;
  readonly fromRetail: string;
  readonly toWholesale: string;
  readonly toRetail: string;
  readonly blocked: boolean;
};

export type PricingPage = {
  readonly role?: 'owner' | 'reseller';
  readonly wholesaleKind: MarkupKind;
  readonly wholesaleValue: string;
  readonly retailKind: MarkupKind;
  readonly retailValue: string;
  readonly minMarginPercent: number;
  readonly overrides: readonly PricingOverride[];
  readonly attentionCount: number;
  readonly defaultCount: number;
  readonly defaultPreview: readonly PricingPreview[];
};

export type PricingApplyResult = {
  readonly repriced: number;
  readonly paused: readonly { readonly id: string; readonly title: string; readonly reason: string }[];
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

const PRODUCT_COLUMNS = 'id, title, status, stock_unlimited, stock_count, supplier_price_minor, wholesale_price, retail_price, markup_percent, wholesale_markup_kind, wholesale_markup_percent, wholesale_markup_minor, retail_markup_kind, retail_markup_percent, retail_markup_minor';

function sameSide(left: MarkupSide, right: MarkupSide): boolean {
  return left.kind === right.kind && left.percent === right.percent && left.minor === right.minor;
}

function ownRule(row: Record<string, unknown>, policy: SyncPolicy): boolean {
  if (row.markup_percent !== null && row.markup_percent !== undefined && row.markup_percent !== '') return true;
  const wholesale = markupSideFromColumns(text(row.wholesale_markup_kind), row.wholesale_markup_percent as string | number | null, row.wholesale_markup_minor as string | number | null);
  const retail = markupSideFromColumns(text(row.retail_markup_kind), row.retail_markup_percent as string | number | null, row.retail_markup_minor as string | number | null);
  const wholesaleDiffers = wholesale !== null && !sameSide(wholesale, policy.wholesale);
  const retailDiffers = retail !== null && !sameSide(retail, policy.retail);
  return wholesaleDiffers || retailDiffers;
}

function costOf(row: Record<string, unknown>): bigint | null {
  const value = row.supplier_price_minor;
  if (value === null || value === undefined || value === '') return null;
  try {
    const cost = BigInt(value as string | number | bigint);
    return cost > 0n ? cost : null;
  } catch {
    return null;
  }
}

function priceOf(row: Record<string, unknown>, column: 'wholesale_price' | 'retail_price'): bigint {
  try {
    return BigInt((row[column] as string | number | bigint | null) ?? 0);
  } catch {
    return 0n;
  }
}

const PAUSE_REASON = 'Would sell at or below cost, or under the minimum margin.';

function quoteDefault(row: Record<string, unknown>, policy: SyncPolicy): { readonly cost: bigint; readonly wholesale: bigint; readonly retail: bigint; readonly blocked: boolean } | null {
  const cost = costOf(row);
  if (cost === null) return null;
  const wholesale = priceWithRule(cost, policy.wholesale);
  const retail = priceWithRule(cost, policy.retail);
  const blocked = wholesale <= cost || retail <= cost || retail < wholesale || marginBelowMinimum(retail, cost, policy.minMarginPercent);
  return { cost, wholesale, retail, blocked };
}

async function readResellerPricing(db: DbClient, tenantId: string): Promise<PricingPage> {
  const settingsRes = (await db
    .from('tenant_settings')
    .select('markup_percent')
    .eq('tenant_id', tenantId)
    .maybeSingle()) as QueryResult<Record<string, unknown> | null>;
  const rawMarkup = settingsRes.data?.markup_percent;
  const parsedMarkup = typeof rawMarkup === 'number' ? rawMarkup : Number(rawMarkup ?? 20);
  const markupPercent = Number.isFinite(parsedMarkup) && parsedMarkup >= 0 ? parsedMarkup : 20;

  const listings = records(
    (await db
      .from('reseller_listings')
      .select('id, product_id, retail_price, price_override')
      .eq('tenant_id', tenantId)
      .limit(1000)) as QueryResult<unknown>,
  );
  const productIds = listings.map((row) => text(row.product_id)).filter(Boolean);
  const products =
    productIds.length === 0
      ? []
      : records(
          (await db
            .from('products')
            .select('id, title, status, stock_unlimited, stock_count, wholesale_price')
            .in('id', productIds)
            .limit(1000)) as QueryResult<unknown>,
        );
  const byProductId = new Map(products.map((row) => [text(row.id), row]));
  const rule: MarkupSide = { kind: 'percent', percent: markupPercent, minor: null };

  const overrides: PricingOverride[] = [];
  const preview: PricingPreview[] = [];
  let attention = 0;
  let defaultCount = 0;

  for (const listing of listings) {
    const product = byProductId.get(text(listing.product_id));
    if (!product || text(product.status) === 'archived') continue;
    if (product.stock_unlimited === false && (typeof product.stock_count !== 'number' || product.stock_count <= REORDER_POINT)) {
      attention += 1;
    }
    const wholesale = priceOf(product, 'wholesale_price');
    const retail = priceOf(listing, 'retail_price');
    const expected = priceWithRule(wholesale, rule);
    if (listing.price_override === true || retail !== expected) {
      overrides.push({
        id: text(listing.id),
        title: text(product.title) || text(product.id),
        wholesaleKind: 'fixed',
        wholesaleValue: sideValue('fixed', null, wholesale),
        retailKind: 'fixed',
        retailValue: sideValue('fixed', null, retail),
      });
      continue;
    }
    defaultCount += 1;
    if (preview.length < 12) {
      preview.push({
        id: text(listing.id),
        title: text(product.title) || text(product.id),
        fromWholesale: sideValue('fixed', null, wholesale),
        fromRetail: sideValue('fixed', null, retail),
        toWholesale: sideValue('fixed', null, wholesale),
        toRetail: sideValue('fixed', null, expected),
        blocked: retail < wholesale,
      });
    }
  }

  return {
    role: 'reseller',
    wholesaleKind: 'percent',
    wholesaleValue: '0',
    retailKind: 'percent',
    retailValue: String(markupPercent),
    minMarginPercent: 0,
    overrides,
    attentionCount: attention,
    defaultCount,
    defaultPreview: preview,
  };
}

export async function readPricing(
  db: DbClient,
  scope: { readonly role: 'owner' | 'reseller'; readonly tenantId: string | null } = {
    role: 'owner',
    tenantId: null,
  },
): Promise<PricingPage> {
  if (scope.role === 'reseller') {
    if (!scope.tenantId) {
      throw new AppError('TENANT_REQUIRED', 'Reseller account is not active', 403);
    }
    return readResellerPricing(db, scope.tenantId);
  }
  const policy = await loadSyncPolicy(db);
  const products = records((await db.from('products').select(PRODUCT_COLUMNS).limit(1000)) as QueryResult<unknown>);
  const overrides: PricingOverride[] = [];
  const preview: PricingPreview[] = [];
  let attention = 0;
  let defaultCount = 0;
  for (const row of products) {
    if (text(row.status) === 'archived') continue;
    if (row.stock_unlimited === false && (typeof row.stock_count !== 'number' || row.stock_count <= REORDER_POINT)) attention += 1;
    const wholesale = markupSideFromColumns(text(row.wholesale_markup_kind), row.wholesale_markup_percent as string | number | null, row.wholesale_markup_minor as string | number | null);
    const retail = markupSideFromColumns(text(row.retail_markup_kind), row.retail_markup_percent as string | number | null, row.retail_markup_minor as string | number | null);
    if (ownRule(row, policy)) {
      overrides.push({
        id: text(row.id),
        title: text(row.title) || text(row.id),
        wholesaleKind: wholesale?.kind ?? policy.wholesale.kind,
        wholesaleValue: sideValue(wholesale?.kind ?? policy.wholesale.kind, wholesale?.percent ?? policy.wholesale.percent, wholesale?.minor ?? policy.wholesale.minor),
        retailKind: retail?.kind ?? policy.retail.kind,
        retailValue: sideValue(retail?.kind ?? policy.retail.kind, retail?.percent ?? policy.retail.percent, retail?.minor ?? policy.retail.minor),
      });
      continue;
    }
    defaultCount += 1;
    const quoted = quoteDefault(row, policy);
    if (!quoted || preview.length >= 12) continue;
    preview.push({
      id: text(row.id),
      title: text(row.title) || text(row.id),
      fromWholesale: sideValue('fixed', null, priceOf(row, 'wholesale_price')),
      fromRetail: sideValue('fixed', null, priceOf(row, 'retail_price')),
      toWholesale: sideValue('fixed', null, quoted.wholesale),
      toRetail: sideValue('fixed', null, quoted.retail),
      blocked: quoted.blocked,
    });
  }
  return {
    role: 'owner',
    wholesaleKind: policy.wholesale.kind,
    wholesaleValue: sideValue(policy.wholesale.kind, policy.wholesale.percent, policy.wholesale.minor),
    retailKind: policy.retail.kind,
    retailValue: sideValue(policy.retail.kind, policy.retail.percent, policy.retail.minor),
    minMarginPercent: policy.minMarginPercent,
    overrides,
    attentionCount: attention,
    defaultCount,
    defaultPreview: preview,
  };
}

/**
 * Reprices products that follow the store default.
 * A product with its own markup is left alone.
 * A price that would break a guard is paused and listed instead.
 */
export async function applyDefaultPricing(db: DbClient, actorId: string): Promise<PricingApplyResult> {
  const policy = await loadSyncPolicy(db);
  const products = records((await db.from('products').select(PRODUCT_COLUMNS).limit(1000)) as QueryResult<unknown>);
  const paused: { id: string; title: string; reason: string }[] = [];
  const repricedIds: string[] = [];
  for (const row of products) {
    if (text(row.status) === 'archived' || ownRule(row, policy)) continue;
    const quoted = quoteDefault(row, policy);
    if (!quoted) continue;
    const id = text(row.id);
    const title = text(row.title) || id;
    if (quoted.blocked) {
      const saved = await db.from('products').update({
        status: 'paused',
        auto_paused_reason: PAUSE_REASON,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (saved.error) throw new AppError('PRICING_SAVE_FAILED', saved.error.message, 500);
      paused.push({ id, title, reason: PAUSE_REASON });
      continue;
    }
    const saved = await db.from('products').update({
      wholesale_price: quoted.wholesale.toString(),
      retail_price: quoted.retail.toString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (saved.error) throw new AppError('PRICING_SAVE_FAILED', saved.error.message, 500);
    repricedIds.push(id);
  }
  const audited = await db.from('audit_log').insert({
    actor_id: actorId,
    action: 'pricing_default_applied',
    target_type: 'catalog',
    target_id: 'platform_settings',
    reason: `Repriced ${repricedIds.length} products on the store default. Paused ${paused.length}.`,
    after_val: { repricedIds, pausedIds: paused.map((item) => item.id) },
  });
  if (audited.error) throw new AppError('PRICING_SAVE_FAILED', audited.error.message, 500);
  return { repriced: repricedIds.length, paused };
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
