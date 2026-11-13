/**
 * Percent and fixed markups for wholesale and retail.
 * This file stays free of Telegram and Node crypto imports so catalog pages can use it.
 */

import { logger } from '@/lib/logger';
import type { DbClient } from '@/lib/supabase/query';

export type MarkupKind = 'percent' | 'fixed';

export type MarkupSide = {
  readonly kind: MarkupKind;
  readonly percent: number | null;
  readonly minor: bigint | null;
};

export type SyncPolicy = {
  readonly autoStockSync: boolean;
  readonly autoReprice: boolean;
  readonly defaultMarkupPercent: number;
  readonly minMarginPercent: number;
  readonly wholesale: MarkupSide;
  readonly retail: MarkupSide;
};

const DEFAULT_SIDE: MarkupSide = { kind: 'percent', percent: 50, minor: null };

export const DEFAULT_SYNC_POLICY: SyncPolicy = {
  autoStockSync: true,
  autoReprice: true,
  defaultMarkupPercent: 50,
  minMarginPercent: 10,
  wholesale: DEFAULT_SIDE,
  retail: DEFAULT_SIDE,
};

export function priceWithMarkup(costMinor: bigint, markupPercent: number): bigint {
  const bounded = Math.max(0, Math.min(999.99, markupPercent));
  const hundredths = BigInt(Math.round(bounded * 100));
  const numerator = costMinor * (10000n + hundredths);
  return (numerator + 9999n) / 10000n;
}

export function priceWithRule(costMinor: bigint, rule: MarkupSide): bigint {
  if (rule.kind === 'fixed') {
    const add = rule.minor ?? 0n;
    return costMinor + (add < 0n ? 0n : add);
  }
  return priceWithMarkup(costMinor, rule.percent ?? 0);
}

export function pricesForRules(
  costMinor: bigint,
  wholesale: MarkupSide,
  retail: MarkupSide,
): { readonly wholesale: bigint; readonly retail: bigint } {
  return {
    wholesale: priceWithRule(costMinor, wholesale),
    retail: priceWithRule(costMinor, retail),
  };
}

export function marginBelowMinimum(retailMinor: bigint, costMinor: bigint, minPercent: number): boolean {
  if (retailMinor <= 0n || retailMinor <= costMinor) {
    return true;
  }
  const bounded = Math.max(0, Math.min(100, minPercent));
  const minHundredths = BigInt(Math.round(bounded * 100));
  return (retailMinor - costMinor) * 10000n < retailMinor * minHundredths;
}

function optionalMinor(value: string | number | null | undefined): bigint | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function markupSideFromColumns(
  kindRaw: string | null | undefined,
  percentRaw: string | number | null | undefined,
  minorRaw: string | number | null | undefined,
): MarkupSide | null {
  if (kindRaw !== 'percent' && kindRaw !== 'fixed') {
    return null;
  }
  if (kindRaw === 'fixed') {
    const minor = optionalMinor(minorRaw);
    return minor === null ? null : { kind: 'fixed', percent: null, minor };
  }
  if (percentRaw === null || percentRaw === undefined || percentRaw === '') {
    return null;
  }
  const percent = Number(percentRaw);
  return Number.isFinite(percent) ? { kind: 'percent', percent, minor: null } : null;
}

function fallbackSide(policy: SyncPolicy, side: MarkupSide, markupPercent: number | null): MarkupSide {
  if (markupPercent !== null) {
    return { kind: 'percent', percent: markupPercent, minor: null };
  }
  if (side.kind === 'fixed' && side.minor !== null) {
    return side;
  }
  if (side.kind === 'percent' && side.percent !== null) {
    return side;
  }
  return { kind: 'percent', percent: policy.defaultMarkupPercent, minor: null };
}

export function resolveMarkupSides(
  product: { readonly markupPercent: number | null; readonly wholesaleRule: MarkupSide | null; readonly retailRule: MarkupSide | null },
  policy: SyncPolicy,
): { readonly wholesale: MarkupSide; readonly retail: MarkupSide } {
  return {
    wholesale: product.wholesaleRule ?? fallbackSide(policy, policy.wholesale, product.markupPercent),
    retail: product.retailRule ?? fallbackSide(policy, policy.retail, product.markupPercent),
  };
}

export function storeMarkupColumns(policy: SyncPolicy): Record<string, string | number | null> {
  const sides = resolveMarkupSides({ markupPercent: null, wholesaleRule: null, retailRule: null }, policy);
  return {
    wholesale_markup_kind: sides.wholesale.kind,
    wholesale_markup_percent: sides.wholesale.kind === 'percent' ? sides.wholesale.percent : null,
    wholesale_markup_minor:
      sides.wholesale.kind === 'fixed' && sides.wholesale.minor !== null ? sides.wholesale.minor.toString() : null,
    retail_markup_kind: sides.retail.kind,
    retail_markup_percent: sides.retail.kind === 'percent' ? sides.retail.percent : null,
    retail_markup_minor: sides.retail.kind === 'fixed' && sides.retail.minor !== null ? sides.retail.minor.toString() : null,
  };
}

export function missingSyncColumn(message: string): boolean {
  return /supplier_in_stock|pricing_mode|markup_percent|markup_kind|markup_minor|supplier_cost_changed_at|auto_paused_reason|default_markup_percent|min_margin_percent|auto_stock_sync|auto_reprice_on_cost_change/i.test(
    message,
  );
}

function finitePercent(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function loadSyncPolicy(supabase: DbClient): Promise<SyncPolicy> {
  const legacy = 'default_markup_percent, min_margin_percent, auto_stock_sync, auto_reprice_on_cost_change';
  const full = `${legacy}, default_wholesale_markup_kind, default_wholesale_markup_percent, default_wholesale_markup_minor, default_retail_markup_kind, default_retail_markup_percent, default_retail_markup_minor`;
  try {
    let result = await supabase.from('platform_settings').select(full).limit(1).maybeSingle();
    if (result.error && missingSyncColumn(result.error.message)) {
      result = await supabase.from('platform_settings').select(legacy).limit(1).maybeSingle();
    }
    if (result.error || !result.data) {
      return DEFAULT_SYNC_POLICY;
    }
    const row = result.data as Record<string, unknown>;
    const defaultMarkupPercent = finitePercent(row.default_markup_percent, DEFAULT_SYNC_POLICY.defaultMarkupPercent);
    const baseSide: MarkupSide = { kind: 'percent', percent: defaultMarkupPercent, minor: null };
    return {
      autoStockSync: row.auto_stock_sync !== false,
      autoReprice: row.auto_reprice_on_cost_change !== false,
      defaultMarkupPercent,
      minMarginPercent: finitePercent(row.min_margin_percent, DEFAULT_SYNC_POLICY.minMarginPercent),
      wholesale:
        markupSideFromColumns(
          row.default_wholesale_markup_kind as string | null | undefined,
          row.default_wholesale_markup_percent as string | number | null | undefined,
          row.default_wholesale_markup_minor as string | number | null | undefined,
        ) ?? baseSide,
      retail:
        markupSideFromColumns(
          row.default_retail_markup_kind as string | null | undefined,
          row.default_retail_markup_percent as string | number | null | undefined,
          row.default_retail_markup_minor as string | number | null | undefined,
        ) ?? baseSide,
    };
  } catch (error: unknown) {
    logger.warn('supplier sync policy unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return DEFAULT_SYNC_POLICY;
  }
}
