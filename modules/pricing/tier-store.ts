/**
 * Reads and replaces bulk tiers for one store.
 * Writes go through service role. A missing table behaves as "no tiers"
 * so checkout still works before migration 0027 is applied.
 */

import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getProduct } from '@/modules/catalog';
import type { Product } from '@/modules/catalog/types';
import {
  orderTotals,
  validateTiers,
  type BulkTier,
  type OrderTotals,
  type TierCheck,
} from '@/modules/pricing/tiers';

export type StoredTier = BulkTier & {
  readonly id: string;
};

export type CostFloor = {
  readonly minor: bigint | null;
  readonly known: boolean;
};

type TierRow = {
  readonly id?: string;
  readonly product_id?: string;
  readonly tenant_id?: string | null;
  readonly min_qty?: number | string;
  readonly unit_price_minor?: string | number | bigint;
};

function missingTiers(message: string): boolean {
  return /product_bulk_tiers|does not exist|schema cache|replace_product_bulk_tiers/i.test(message);
}

function asTier(row: TierRow): StoredTier | null {
  if (row.min_qty === undefined || row.unit_price_minor === undefined) {
    return null;
  }
  const minQty = typeof row.min_qty === 'number' ? row.min_qty : Number(row.min_qty);
  if (!Number.isInteger(minQty)) {
    return null;
  }
  return {
    id: row.id ?? '',
    minQty,
    unitPriceMinor: BigInt(row.unit_price_minor),
  };
}

export async function listBulkTiers(
  supabase: DbClient,
  productId: string,
  tenantId: string | null,
): Promise<StoredTier[]> {
  const query = supabase.from('product_bulk_tiers').select('*').eq('product_id', productId);
  const scoped = tenantId === null ? query.is('tenant_id', null) : query.eq('tenant_id', tenantId);
  const result = (await scoped) as QueryResult<unknown[] | null>;
  if (result.error) {
    if (missingTiers(result.error.message)) {
      return [];
    }
    throw new AppError('TIER_LOOKUP_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows
    .map((row) => asTier(row as TierRow))
    .filter((tier): tier is StoredTier => tier !== null)
    .sort((left, right) => left.minQty - right.minQty);
}

export async function readCostFloor(
  supabase: DbClient,
  product: Pick<Product, 'id' | 'wholesalePriceMinor' | 'supplierId'>,
  scope: 'owner' | 'reseller',
): Promise<CostFloor> {
  const wholesale = product.wholesalePriceMinor > 0n ? product.wholesalePriceMinor : null;
  if (scope === 'reseller') {
    return wholesale === null ? { minor: null, known: false } : { minor: wholesale, known: true };
  }
  let supplier: bigint | null = null;
  if (product.supplierId) {
    const row = (await supabase
      .from('products')
      .select('supplier_price_minor')
      .eq('id', product.id)
      .maybeSingle()) as QueryResult<{ supplier_price_minor?: string | number | bigint | null } | null>;
    if (!row.error && row.data?.supplier_price_minor !== null && row.data?.supplier_price_minor !== undefined) {
      const cost = BigInt(row.data.supplier_price_minor);
      if (cost > 0n) {
        supplier = cost;
      }
    }
  }
  const known = [wholesale, supplier].filter((value): value is bigint => value !== null);
  if (known.length === 0) {
    return { minor: null, known: false };
  }
  return { minor: known.reduce((highest, value) => (value > highest ? value : highest)), known: true };
}

export async function quoteCheckout(input: {
  readonly supabase: DbClient;
  readonly channel: 'owner_store' | 'reseller_bot' | 'api';
  readonly tenantId: string | null;
  readonly product: Product;
  readonly baseUnit: bigint;
  readonly quantity: number;
}): Promise<OrderTotals> {
  const wholesaleUnit = input.product.wholesalePriceMinor;
  if (input.channel === 'api') {
    const qty = BigInt(input.quantity);
    return {
      unitRetailMinor: input.baseUnit,
      quotedRetailMinor: input.baseUnit * qty,
      quotedWholesaleMinor: wholesaleUnit * qty,
      savingsMinor: 0n,
      tierApplied: false,
    };
  }
  const storeTenant = input.channel === 'reseller_bot' ? input.tenantId : null;
  const tiers = await listBulkTiers(input.supabase, input.product.id, storeTenant);
  const floor = await readCostFloor(
    input.supabase,
    input.product,
    input.channel === 'reseller_bot' ? 'reseller' : 'owner',
  );
  return orderTotals({
    baseUnit: input.baseUnit,
    tiers,
    quantity: input.quantity,
    wholesaleUnit,
    floorMinor: floor.minor,
  });
}

export async function replaceBulkTiers(
  supabase: DbClient,
  productId: string,
  tenantId: string | null,
  tiers: readonly BulkTier[],
): Promise<StoredTier[]> {
  const product = await getProduct(supabase, productId);
  if (tenantId !== null) {
    const listing = await supabase
      .from('reseller_listings')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('product_id', productId)
      .maybeSingle();
    if (listing.error) {
      throw new AppError('LISTING_LOOKUP_FAILED', listing.error.message, 500);
    }
    if (listing.data === null) {
      throw new NotFoundError('listing');
    }
  }
  const base = tenantId === null ? product.retailPriceMinor : await resellerBase(supabase, tenantId, productId);
  const floor = await readCostFloor(supabase, product, tenantId === null ? 'owner' : 'reseller');
  const checked: TierCheck = validateTiers(base, floor.minor, tiers);
  const payload = checked.tiers.map((tier) => ({
    min_qty: tier.minQty,
    unit_price_minor: tier.unitPriceMinor.toString(),
  }));
  const replaced = await supabase.rpc('replace_product_bulk_tiers', {
    p_product_id: productId,
    p_tenant_id: tenantId,
    p_rows: payload,
  });
  if (replaced.error) {
    if (!missingTiers(replaced.error.message)) {
      throw new AppError('TIER_SAVE_FAILED', replaced.error.message, 500);
    }
    await replaceWithoutRpc(supabase, productId, tenantId, checked.tiers);
  }
  return listBulkTiers(supabase, productId, tenantId);
}

async function resellerBase(supabase: DbClient, tenantId: string, productId: string): Promise<bigint> {
  const listing = (await supabase
    .from('reseller_listings')
    .select('retail_price')
    .eq('tenant_id', tenantId)
    .eq('product_id', productId)
    .maybeSingle()) as QueryResult<{ retail_price?: string | number | bigint } | null>;
  if (listing.error || listing.data?.retail_price === undefined) {
    throw new NotFoundError('listing');
  }
  return BigInt(listing.data.retail_price);
}

async function replaceWithoutRpc(
  supabase: DbClient,
  productId: string,
  tenantId: string | null,
  tiers: readonly BulkTier[],
): Promise<void> {
  const existing = supabase.from('product_bulk_tiers').delete().eq('product_id', productId);
  const removed = (await (tenantId === null ? existing.is('tenant_id', null) : existing.eq('tenant_id', tenantId))) as QueryResult<unknown>;
  if (removed.error) {
    throw new AppError('TIER_SAVE_FAILED', removed.error.message, 500);
  }
  for (const tier of tiers) {
    const inserted = (await supabase.from('product_bulk_tiers').insert({
      product_id: productId,
      tenant_id: tenantId,
      min_qty: tier.minQty,
      unit_price_minor: tier.unitPriceMinor.toString(),
    })) as QueryResult<unknown>;
    if (inserted.error) {
      throw new ValidationError('TIER_SAVE_FAILED', inserted.error.message);
    }
  }
}

export async function tierContext(
  supabase: DbClient,
  productId: string,
  tenantId: string | null,
): Promise<{ tiers: StoredTier[]; floor: CostFloor; baseUnit: bigint; note: string }> {
  const product = await getProduct(supabase, productId);
  const baseUnit = tenantId === null ? product.retailPriceMinor : await resellerBase(supabase, tenantId, productId);
  const floor = await readCostFloor(supabase, product, tenantId === null ? 'owner' : 'reseller');
  const tiers = await listBulkTiers(supabase, productId, tenantId);
  const note =
    floor.known && floor.minor !== null
      ? `Prices must stay at or above ${formatUsdt(floor.minor)} and below ${formatUsdt(baseUnit)}.`
      : 'Cost is unknown, so the only check is that each tier price is above zero and below the regular price.';
  return { tiers, floor, baseUnit, note };
}
