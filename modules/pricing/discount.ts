/**
 * @file modules/pricing/discount.ts
 *
 * Checkout codes. Bulk price first, then the code, never under the cost floor.
 */

import { ValidationError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getProduct } from '@/modules/catalog';
import { assertCustomerAllowed } from '@/modules/platform/fraud';
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
  try {
    await assertCustomerAllowed(db, input.customerId, 'discount');
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { applied: true, ok: false, message: error.message };
    }
    throw error;
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
  // The only write path: redeem_discount_code locks the code row, checks every
  // rule, inserts the redemption, and increments used_count in one transaction.
  const redeemed = (await db.rpc('redeem_discount_code', {
    p_code_id: row.id,
    p_customer_id: input.customerId,
    p_order_id: order.id,
    p_order_minor: quoted.toString(),
  })) as QueryResult<unknown>;
  if (redeemed.error) {
    return { applied: true, ok: false, message: 'That code could not be applied. Try again.' };
  }
  const outcome = readRedeemOutcome(redeemed.data);
  if (!outcome.ok) {
    return { applied: true, ok: false, message: REDEEM_REASONS[outcome.reason] ?? 'That code cannot be used on this order.' };
  }
  if (outcome.reason === 'already') {
    return { applied: true, ok: true, total: formatUsdt(quoted) };
  }
  const updated = await db.from('orders').update({ quoted_retail_price: priced.priceMinor.toString(), updated_at: new Date().toISOString() }).eq('id', order.id).eq('payment_status', 'awaiting');
  if (updated.error) {
    throw new ValidationError('DISCOUNT_FAILED', 'The code was recorded but the price did not change. Open the order and try the code again.');
  }
  return { applied: true, ok: true, total: formatUsdt(priced.priceMinor) };
}

const REDEEM_REASONS: Readonly<Record<string, string>> = {
  missing: 'That code does not exist.',
  inactive: 'That code is turned off.',
  not_started: 'That code has not started yet.',
  expired: 'That code has expired.',
  max_uses: 'That code has been used up.',
  min_order: 'This order is below the code minimum.',
  per_customer: 'You have already used that code.',
};

function readRedeemOutcome(data: unknown): { readonly ok: boolean; readonly reason: string } {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') return { ok: false, reason: 'unknown' };
  const record = value as Record<string, unknown>;
  return { ok: record.ok === true, reason: typeof record.reason === 'string' ? record.reason : 'unknown' };
}
