/**
 * Writes supplier stock and cost changes onto the linked catalog products.
 * Stock uses supplier_in_stock. The owner's stock_unlimited and stock_count stay put.
 */

import { logger } from '@/lib/logger';
import type { DbClient } from '@/lib/supabase/query';

export type SyncPolicy = {
  readonly autoStockSync: boolean;
  readonly autoReprice: boolean;
  readonly defaultMarkupPercent: number;
  readonly minMarginPercent: number;
};

export const DEFAULT_SYNC_POLICY: SyncPolicy = {
  autoStockSync: true,
  autoReprice: true,
  defaultMarkupPercent: 50,
  minMarginPercent: 10,
};

const LOSS_REASON = 'Retail is at or below the supplier cost';
const MARGIN_REASON = 'Supplier cost leaves less than the minimum margin';

export type LinkedCatalogProduct = {
  readonly id: string;
  readonly supplierPriceMinor: bigint | null;
  readonly retailMinor: bigint;
  readonly wholesaleMinor: bigint;
  readonly pricingMode: 'manual' | 'markup';
  readonly markupPercent: number | null;
  readonly supplierInStock: boolean;
  readonly status: string;
  readonly version: number;
  readonly autoPausedReason: string | null;
};

export type CatalogWrite = {
  readonly id: string;
  readonly patch: Record<string, unknown>;
  readonly stockChanged: boolean;
  readonly repriced: boolean;
  readonly autoPaused: boolean;
  readonly notice: { readonly productId: string; readonly name: string; readonly reason: string } | null;
};

type LinkedRow = {
  readonly id: string;
  readonly supplier_price_minor?: string | number | null;
  readonly retail_price: string | number;
  readonly wholesale_price: string | number;
  readonly pricing_mode?: string | null;
  readonly markup_percent?: string | number | null;
  readonly supplier_in_stock?: boolean | null;
  readonly status?: string | null;
  readonly version?: number | string | null;
  readonly auto_paused_reason?: string | null;
};

export function priceWithMarkup(costMinor: bigint, markupPercent: number): bigint {
  const bounded = Math.max(0, Math.min(999.99, markupPercent));
  const hundredths = BigInt(Math.round(bounded * 100));
  const numerator = costMinor * (10000n + hundredths);
  return (numerator + 9999n) / 10000n;
}

export function marginBelowMinimum(retailMinor: bigint, costMinor: bigint, minPercent: number): boolean {
  if (retailMinor <= 0n || retailMinor <= costMinor) {
    return true;
  }
  const bounded = Math.max(0, Math.min(100, minPercent));
  const minHundredths = BigInt(Math.round(bounded * 100));
  return (retailMinor - costMinor) * 10000n < retailMinor * minHundredths;
}

function finitePercent(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeLinkedProduct(row: LinkedRow): LinkedCatalogProduct {
  const markup = row.markup_percent;
  const parsedMarkup = markup === null || markup === undefined || markup === '' ? null : Number(markup);
  return {
    id: row.id,
    supplierPriceMinor:
      row.supplier_price_minor === null || row.supplier_price_minor === undefined
        ? null
        : BigInt(row.supplier_price_minor),
    retailMinor: BigInt(row.retail_price),
    wholesaleMinor: BigInt(row.wholesale_price),
    pricingMode: row.pricing_mode === 'markup' ? 'markup' : 'manual',
    markupPercent: parsedMarkup !== null && Number.isFinite(parsedMarkup) ? parsedMarkup : null,
    supplierInStock: row.supplier_in_stock !== false,
    status: row.status ?? 'published',
    version: Number(row.version ?? 1),
    autoPausedReason: row.auto_paused_reason ?? null,
  };
}

export function catalogWriteForChange(input: {
  readonly product: LinkedCatalogProduct;
  readonly name: string;
  readonly inStock: boolean;
  readonly costMinor: bigint | null;
  readonly policy: SyncPolicy;
  readonly considerCost: boolean;
}): CatalogWrite | null {
  const patch: Record<string, unknown> = {};
  let stockChanged = false;
  let repriced = false;
  let autoPaused = false;
  let notice: CatalogWrite['notice'] = null;
  const product = input.product;

  if (input.policy.autoStockSync && product.supplierInStock !== input.inStock) {
    patch.supplier_in_stock = input.inStock;
    stockChanged = true;
  }

  const nextCost = input.considerCost ? input.costMinor : null;
  const costChanged = nextCost !== null && nextCost !== product.supplierPriceMinor;
  if (costChanged && nextCost !== null) {
    patch.supplier_price_minor = nextCost.toString();
    patch.supplier_cost_changed_at = new Date().toISOString();
    const mode = product.pricingMode;
    let pauseReason: string | null = null;
    if (mode === 'markup' && input.policy.autoReprice) {
      const percent = product.markupPercent ?? input.policy.defaultMarkupPercent;
      const nextPrice = priceWithMarkup(nextCost, percent);
      if (nextPrice <= nextCost) {
        pauseReason = LOSS_REASON;
      } else if (nextPrice !== product.retailMinor || nextPrice !== product.wholesaleMinor) {
        patch.wholesale_price = nextPrice.toString();
        patch.retail_price = nextPrice.toString();
        patch.version = product.version + 1;
        repriced = true;
      }
    } else if (product.retailMinor <= nextCost) {
      pauseReason = LOSS_REASON;
    } else if (mode === 'manual' && marginBelowMinimum(product.retailMinor, nextCost, input.policy.minMarginPercent)) {
      pauseReason = MARGIN_REASON;
    }
    if (pauseReason) {
      if (product.status !== 'paused') {
        patch.status = 'paused';
        patch.auto_paused_reason = pauseReason;
        autoPaused = true;
        notice = { productId: product.id, name: input.name, reason: pauseReason };
      } else if (product.autoPausedReason !== pauseReason) {
        patch.auto_paused_reason = pauseReason;
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return null;
  }
  return { id: product.id, patch, stockChanged, repriced, autoPaused, notice };
}

export function missingSyncColumn(message: string): boolean {
  return /supplier_in_stock|pricing_mode|markup_percent|supplier_cost_changed_at|auto_paused_reason|default_markup_percent|min_margin_percent|auto_stock_sync|auto_reprice_on_cost_change/i.test(
    message,
  );
}

export async function loadSyncPolicy(supabase: DbClient): Promise<SyncPolicy> {
  try {
    const result = await supabase
      .from('platform_settings')
      .select('default_markup_percent, min_margin_percent, auto_stock_sync, auto_reprice_on_cost_change')
      .limit(1)
      .maybeSingle();
    if (result.error) {
      return DEFAULT_SYNC_POLICY;
    }
    const row = result.data as Record<string, unknown> | null;
    if (!row) {
      return DEFAULT_SYNC_POLICY;
    }
    return {
      autoStockSync: row.auto_stock_sync !== false,
      autoReprice: row.auto_reprice_on_cost_change !== false,
      defaultMarkupPercent: finitePercent(row.default_markup_percent, DEFAULT_SYNC_POLICY.defaultMarkupPercent),
      minMarginPercent: finitePercent(row.min_margin_percent, DEFAULT_SYNC_POLICY.minMarginPercent),
    };
  } catch (error: unknown) {
    logger.warn('supplier sync policy unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return DEFAULT_SYNC_POLICY;
  }
}

function isStockOnly(patch: Record<string, unknown>): boolean {
  const keys = Object.keys(patch);
  return keys.length === 1 && keys[0] === 'supplier_in_stock';
}

export async function flushCatalogWrites(
  supabase: DbClient,
  writes: readonly CatalogWrite[],
  now: string,
): Promise<{ stockChanged: number; repriced: number; autoPaused: number; errors: string[]; notices: CatalogWrite['notice'][] }> {
  let stockChanged = 0;
  let repriced = 0;
  let autoPaused = 0;
  const errors: string[] = [];
  const notices: CatalogWrite['notice'][] = [];
  const stockOnly = writes.filter((write) => isStockOnly(write.patch));
  const detailed = writes.filter((write) => !isStockOnly(write.patch));

  for (const flag of [false, true]) {
    const group = stockOnly.filter((write) => write.patch.supplier_in_stock === flag);
    for (let index = 0; index < group.length; index += 200) {
      const chunk = group.slice(index, index + 200);
      const saved = (await supabase
        .from('products')
        .update({ supplier_in_stock: flag, updated_at: now })
        .in(
          'id',
          chunk.map((write) => write.id),
        )) as { error?: { message: string } | null };
      if (saved.error) {
        if (!missingSyncColumn(saved.error.message)) {
          errors.push(saved.error.message);
        }
        continue;
      }
      stockChanged += chunk.length;
    }
  }

  for (let index = 0; index < detailed.length; index += 20) {
    const batch = detailed.slice(index, index + 20);
    const outcomes = await Promise.all(
      batch.map(async (write) => {
        const saved = (await supabase
          .from('products')
          .update({ ...write.patch, updated_at: now })
          .eq('id', write.id)) as { error?: { message: string } | null };
        return { write, error: saved.error?.message ?? null };
      }),
    );
    for (const outcome of outcomes) {
      if (outcome.error) {
        if (!missingSyncColumn(outcome.error)) {
          errors.push(outcome.error);
        }
        continue;
      }
      if (outcome.write.stockChanged) {
        stockChanged += 1;
      }
      if (outcome.write.repriced) {
        repriced += 1;
      }
      if (outcome.write.autoPaused) {
        autoPaused += 1;
        if (outcome.write.notice) {
          notices.push(outcome.write.notice);
        }
      }
    }
  }

  return { stockChanged, repriced, autoPaused, errors, notices };
}

export async function notifyOwnerAutoPaused(
  supabase: DbClient,
  notices: readonly { readonly productId: string; readonly name: string; readonly reason: string }[],
): Promise<void> {
  if (notices.length === 0) {
    return;
  }
  const body = notices.map((notice) => `${notice.name}: ${notice.reason}`).join('\n');
  try {
    const { createNotification } = await import('@/modules/notifications');
    const listed = (await supabase.from('profiles').select('id').eq('role', 'owner')) as { data?: unknown };
    const rows = Array.isArray(listed.data) ? listed.data : [];
    for (const raw of rows) {
      const id = (raw as { id?: string }).id;
      if (!id) {
        continue;
      }
      await createNotification(supabase, {
        userId: id,
        type: 'product_updated',
        title: 'Supplier cost paused a product',
        body,
        metadata: { productIds: notices.map((notice) => notice.productId) },
      });
    }
  } catch (error: unknown) {
    logger.warn('owner pause notification skipped', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
  try {
    const { getDecryptedOwnerBotToken } = await import('@/modules/platform');
    const { sendHtmlNotice } = await import('@/integrations/telegram/delivery');
    const settings = await supabase.from('platform_settings').select('owner_bot_id, support_telegram').limit(1).maybeSingle();
    const row = settings.data as { owner_bot_id?: string | null; support_telegram?: string | null } | null;
    const chatId = row?.support_telegram?.match(/^\d+$/) ? row.support_telegram : row?.owner_bot_id;
    if (!chatId) {
      return;
    }
    const token = await getDecryptedOwnerBotToken(supabase);
    if (!token) {
      return;
    }
    const lines = notices
      .slice(0, 10)
      .map((notice) => `• ${notice.name}: ${notice.reason}`)
      .join('\n');
    await sendHtmlNotice(token, String(chatId), `⚠️ <b>Supplier cost paused products</b>\n\n${lines}`);
  } catch (error: unknown) {
    logger.warn('owner pause telegram skipped', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}
