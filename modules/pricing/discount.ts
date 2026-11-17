/**
 * @file modules/pricing/discount.ts
 *
 * Checkout codes. Bulk price first, then the code, never under the cost floor.
 */

import { ValidationError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getProduct } from '@/modules/catalog';
import { readCostFloor } from '@/modules/pricing/tier-store';

export function priceAfterDiscount(input: {
  readonly quotedRetailMinor: bigint;
  readonly floorMinor: bigint | null;
  readonly quantity: number;
  readonly kind: 'percent' | 'fixed';
  readonly valueMinor: bigint;
}): { readonly priceMinor: bigint; readonly clamped: boolean } {
  const quantity = BigInt(Math.max(1, input.quantity));
  let next = input.quotedRetailMinor;
  if (input.kind === 'percent') {
    const percent = input.valueMinor > 100n ? 100n : input.valueMinor;
    next = (input.quotedRetailMinor * (100n - percent)) / 100n;
  } else {
    next = input.quotedRetailMinor - input.valueMinor;
  }
  if (next < 0n) {
    next = 0n;
  }
  if (input.floorMinor === null) {
    return { priceMinor: next, clamped: false };
  }
  const floor = input.floorMinor * quantity;
  if (next < floor) {
    return { priceMinor: floor, clamped: true };
  }
  return { priceMinor: next, clamped: false };
}

type CodeRow = {
  readonly id: string;
  readonly kind: 'percent' | 'fixed';
  readonly value: string;
  readonly min_order_minor: string | number;
  readonly max_uses: number | null;
  readonly used_count: number;
  readonly per_customer_limit: number | null;
  readonly starts_at: string | null;
  readonly expires_at: string | null;
  readonly active: boolean;
};

function asCode(value: unknown): CodeRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || (row.kind !== 'percent' && row.kind !== 'fixed')) return null;
  return row as CodeRow;
}

function minor(value: string | number | null | undefined): bigint {
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      return BigInt(String(value).split('.')[0] ?? '0');
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function missing(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return error.code === '42P01' || error.code === '42703' || message.includes('does not exist') || message.includes('schema cache');
}

export type RedeemResult =
  | { readonly applied: false }
  | { readonly applied: true; readonly ok: true; readonly total: string }
  | { readonly applied: true; readonly ok: false; readonly message: string };

export async function redeemOpenCheckout(db: DbClient, input: { readonly customerId: string; readonly tenantId: string | null; readonly code: string }): Promise<RedeemResult> {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) {
    return { applied: false };
  }
  const orders = (await db
    .from('orders')
    .select('id, product_id, quantity, quoted_retail_price, payment_status, tenant_id, channel')
    .eq('customer_id', input.customerId)
    .eq('payment_status', 'awaiting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as QueryResult<unknown>;
  const order = orders.data && typeof orders.data === 'object' ? (orders.data as Record<string, unknown>) : null;
  if (!order || typeof order.id !== 'string' || typeof order.product_id !== 'string') {
    return { applied: false };
  }
  let codeQuery = db.from('discount_codes').select('id, kind, value, min_order_minor, max_uses, used_count, per_customer_limit, starts_at, expires_at, active').eq('code', code).eq('active', true);
  codeQuery = input.tenantId ? codeQuery.eq('tenant_id', input.tenantId) : codeQuery.is('tenant_id', null);
  const found = (await codeQuery.maybeSingle()) as QueryResult<unknown>;
  if (missing(found.error)) {
    return { applied: true, ok: false, message: 'Discount codes need migration 0032.' };
  }
  const row = asCode(found.data);
  if (!row) {
    return { applied: false };
  }
  const now = Date.now();
  if (row.starts_at && Date.parse(row.starts_at) > now) {
    return { applied: true, ok: false, message: 'That code has not started yet.' };
  }
  if (row.expires_at && Date.parse(row.expires_at) <= now) {
    return { applied: true, ok: false, message: 'That code has expired.' };
  }
  const quoted = minor(typeof order.quoted_retail_price === 'string' || typeof order.quoted_retail_price === 'number' ? order.quoted_retail_price : '0');
  if (quoted < minor(row.min_order_minor)) {
    return { applied: true, ok: false, message: `This order is below the code minimum of ${formatUsdt(minor(row.min_order_minor))}.` };
  }
  const existing = (await db.from('discount_redemptions').select('id').eq('code_id', row.id).eq('order_id', order.id).maybeSingle()) as QueryResult<unknown>;
  if (missing(existing.error)) {
    return { applied: true, ok: false, message: 'Discount codes need migration 0032.' };
  }
  if (existing.data) {
    return { applied: true, ok: true, total: formatUsdt(quoted) };
  }
  const prior = (await db.from('discount_redemptions').select('id', { count: 'exact', head: true }).eq('code_id', row.id)) as QueryResult<unknown>;
  const used = prior.count ?? row.used_count;
  if (row.max_uses !== null && used >= row.max_uses) {
    return { applied: true, ok: false, message: 'That code has been used up.' };
  }
  if (row.per_customer_limit !== null) {
    const mine = (await db.from('discount_redemptions').select('id', { count: 'exact', head: true }).eq('code_id', row.id).eq('customer_id', input.customerId)) as QueryResult<unknown>;
    if ((mine.count ?? 0) >= row.per_customer_limit) {
      return { applied: true, ok: false, message: 'You have already used that code.' };
    }
  }
  const product = await getProduct(db, order.product_id);
  const quantity = typeof order.quantity === 'number' ? order.quantity : 1;
  const channel = order.channel === 'reseller_bot' ? 'reseller' : 'owner';
  const floor = await readCostFloor(db, product, channel);
  if (!floor.known || floor.minor === null) {
    return { applied: true, ok: false, message: 'This product has no cost floor, so the code cannot be applied.' };
  }
  const priced = priceAfterDiscount({
    quotedRetailMinor: quoted,
    floorMinor: floor.minor,
    quantity,
    kind: row.kind,
    valueMinor: minor(row.value),
  });
  if (priced.priceMinor >= quoted) {
    return { applied: true, ok: false, message: 'That code cannot lower this order below the store minimum.' };
  }
  const saved = (await db.from('discount_redemptions').insert({ code_id: row.id, customer_id: input.customerId, order_id: order.id }).select('id').maybeSingle()) as QueryResult<unknown>;
  if (saved.error?.code === '23505') {
    return { applied: true, ok: true, total: formatUsdt(priced.priceMinor) };
  }
  if (saved.error) {
    return { applied: true, ok: false, message: missing(saved.error) ? 'Discount codes need migration 0032.' : 'That code could not be applied. Try again.' };
  }
  const updated = await db.from('orders').update({ quoted_retail_price: priced.priceMinor.toString(), updated_at: new Date().toISOString() }).eq('id', order.id).eq('payment_status', 'awaiting');
  if (updated.error) {
    throw new ValidationError('DISCOUNT_FAILED', 'The code was recorded but the price did not change. Open the order and try the code again.');
  }
  await db.from('discount_codes').update({ used_count: used + 1 }).eq('id', row.id).eq('used_count', row.used_count);
  return { applied: true, ok: true, total: formatUsdt(priced.priceMinor) };
}
