/**
 * Per-customer fraud thresholds from platform_settings.
 * Missing 0032 columns do not block buyers. A blocked customer is always refused,
 * and every refusal is written to audit_log.
 */

import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { DbClient, QueryResult } from '@/lib/supabase/query';

export type FraudAction = 'order' | 'paid_order' | 'claim' | 'support' | 'referral' | 'freebie' | 'discount';

export type FraudThresholds = {
  readonly ordersPerHour: number;
  readonly ordersPerDay: number;
  readonly failedClaimsPerHour: number;
  readonly supportMessagesPerHour: number;
  readonly referralClaimsPerDay: number;
  readonly freebieClaimsPerDay: number;
  readonly discountRedemptionsPerCustomer: number;
  readonly newAccountOrderCap: number;
  readonly newAccountAgeHours: number;
};

export const FRAUD_DEFAULTS: FraudThresholds = {
  ordersPerHour: 20,
  ordersPerDay: 50,
  failedClaimsPerHour: 5,
  supportMessagesPerHour: 30,
  referralClaimsPerDay: 10,
  freebieClaimsPerDay: 5,
  discountRedemptionsPerCustomer: 5,
  newAccountOrderCap: 3,
  newAccountAgeHours: 24,
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function missingColumn(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return error.code === '42703' || error.code === '42P01' || message.includes('does not exist') || message.includes('schema cache');
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function rows(db: DbClient, table: string, filters: ReadonlyArray<readonly [string, string]>, since?: string): Promise<Record<string, unknown>[]> {
  let query = db.from(table).select('*');
  for (const [column, value] of filters) query = query.eq(column, value);
  if (since) query = query.gte('created_at', since);
  const result = (await query.limit(500)) as QueryResult<unknown>;
  if (result.error) {
    if (missingColumn(result.error)) return [];
    throw new ValidationError('FRAUD_LOOKUP_FAILED', result.error.message);
  }
  return Array.isArray(result.data) ? result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null) : [];
}

export async function loadFraudThresholds(db: DbClient): Promise<{ readonly thresholds: FraudThresholds; readonly needsMigration: boolean; readonly enforce: boolean }> {
  const result = (await db
    .from('platform_settings')
    .select('fraud_orders_per_hour, fraud_orders_per_day, fraud_failed_claims_per_hour, fraud_support_messages_per_hour, fraud_referral_claims_per_day, fraud_freebie_claims_per_day, fraud_discount_redemptions_per_customer, fraud_new_account_order_cap, fraud_new_account_age_hours')
    .limit(1)
    .maybeSingle()) as QueryResult<unknown>;
  if (missingColumn(result.error) || !result.data || typeof result.data !== 'object') {
    return { thresholds: FRAUD_DEFAULTS, needsMigration: true, enforce: false };
  }
  const row = result.data as Record<string, unknown>;
  if (row.fraud_orders_per_hour === undefined || row.fraud_orders_per_hour === null) {
    return { thresholds: FRAUD_DEFAULTS, needsMigration: true, enforce: false };
  }
  return {
    needsMigration: false,
    enforce: true,
    thresholds: {
      ordersPerHour: numberOr(row.fraud_orders_per_hour, FRAUD_DEFAULTS.ordersPerHour),
      ordersPerDay: numberOr(row.fraud_orders_per_day, FRAUD_DEFAULTS.ordersPerDay),
      failedClaimsPerHour: numberOr(row.fraud_failed_claims_per_hour, FRAUD_DEFAULTS.failedClaimsPerHour),
      supportMessagesPerHour: numberOr(row.fraud_support_messages_per_hour, FRAUD_DEFAULTS.supportMessagesPerHour),
      referralClaimsPerDay: numberOr(row.fraud_referral_claims_per_day, FRAUD_DEFAULTS.referralClaimsPerDay),
      freebieClaimsPerDay: numberOr(row.fraud_freebie_claims_per_day, FRAUD_DEFAULTS.freebieClaimsPerDay),
      discountRedemptionsPerCustomer: numberOr(row.fraud_discount_redemptions_per_customer, FRAUD_DEFAULTS.discountRedemptionsPerCustomer),
      newAccountOrderCap: numberOr(row.fraud_new_account_order_cap, FRAUD_DEFAULTS.newAccountOrderCap),
      newAccountAgeHours: numberOr(row.fraud_new_account_age_hours, FRAUD_DEFAULTS.newAccountAgeHours),
    },
  };
}

async function writeRefusal(db: DbClient, customerId: string, action: string, reason: string): Promise<void> {
  const inserted = await db.from('audit_log').insert({
    actor_id: null,
    action,
    target_type: 'customer',
    target_id: customerId,
    reason: reason.slice(0, 500),
  });
  const result = inserted as QueryResult<unknown>;
  if (result.error) {
    logger.error('fraud audit failed', { message: result.error.message, action });
  }
}

function tighter(thresholds: FraudThresholds, createdAt: string | null, now: number): FraudThresholds {
  if (!createdAt) return thresholds;
  const ageMs = now - new Date(createdAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs >= thresholds.newAccountAgeHours * HOUR_MS) return thresholds;
  const cap = thresholds.newAccountOrderCap;
  const cut = (value: number): number => Math.max(1, Math.min(value, cap));
  return {
    ...thresholds,
    ordersPerHour: cut(thresholds.ordersPerHour),
    ordersPerDay: cut(thresholds.ordersPerDay),
    failedClaimsPerHour: cut(thresholds.failedClaimsPerHour),
    supportMessagesPerHour: Math.max(1, Math.min(thresholds.supportMessagesPerHour, cap * 2)),
    referralClaimsPerDay: cut(thresholds.referralClaimsPerDay),
  };
}

async function customerRow(db: DbClient, customerId: string): Promise<Record<string, unknown> | null> {
  const result = (await db.from('customers').select('id, is_blocked, blocked_at, created_at').eq('id', customerId).maybeSingle()) as QueryResult<unknown>;
  if (result.error || !result.data || typeof result.data !== 'object') return null;
  return result.data as Record<string, unknown>;
}

const PAID_OR_SETTLED_PAYMENT_STATUSES = new Set(['verified', 'not_required', 'refunded', 'refund_pending']);

/**
 * Refuses a blocked customer or one who is over the threshold for this action.
 * Paid orders are never refused by an order-count cap — the guard only sits on
 * unpaid order floods, referral claims, freebie claims, and discount redemptions.
 * The thrown message is the reason. The same reason is stored on audit_log.
 */
export async function assertCustomerAllowed(db: DbClient, customerId: string, action: FraudAction, now = Date.now()): Promise<void> {
  const customer = await customerRow(db, customerId);
  if (customer && (customer.is_blocked === true || (typeof customer.blocked_at === 'string' && customer.blocked_at.length > 0))) {
    const reason = 'This account is blocked and cannot buy or message.';
    await writeRefusal(db, customerId, 'fraud.blocked', reason);
    throw new ValidationError('CUSTOMER_BLOCKED', reason);
  }
  if (action === 'paid_order') {
    return;
  }
  const loaded = await loadFraudThresholds(db);
  if (!loaded.enforce || !customer) return;
  const limits = tighter(loaded.thresholds, typeof customer.created_at === 'string' ? customer.created_at : null, now);
  const hour = new Date(now - HOUR_MS).toISOString();
  const day = new Date(now - DAY_MS).toISOString();
  if (action === 'order') {
    const recentOrders = await rows(db, 'orders', [['customer_id', customerId]], hour);
    const unpaidHourCount = recentOrders.filter(
      (row) => !PAID_OR_SETTLED_PAYMENT_STATUSES.has(String(row.payment_status ?? '')),
    ).length;
    if (unpaidHourCount >= limits.ordersPerHour) {
      const reason = `This account has reached ${limits.ordersPerHour} unpaid orders this hour.`;
      await writeRefusal(db, customerId, 'fraud.order_refused', reason);
      throw new ValidationError('FRAUD_LIMIT', reason);
    }
    return;
  }
  if (action === 'freebie') {
    const claims = (await rows(db, 'freebie_claims', [['customer_id', customerId]], day)).length;
    if (claims >= loaded.thresholds.freebieClaimsPerDay) {
      const reason = `This account has reached ${loaded.thresholds.freebieClaimsPerDay} freebie claims today.`;
      await writeRefusal(db, customerId, 'fraud.freebie_refused', reason);
      throw new ValidationError('FRAUD_LIMIT', reason);
    }
    return;
  }
  if (action === 'discount') {
    const redemptions = (await rows(db, 'discount_redemptions', [['customer_id', customerId]])).length;
    if (redemptions >= loaded.thresholds.discountRedemptionsPerCustomer) {
      const reason = `This account has reached ${loaded.thresholds.discountRedemptionsPerCustomer} discount redemptions.`;
      await writeRefusal(db, customerId, 'fraud.discount_refused', reason);
      throw new ValidationError('FRAUD_LIMIT', reason);
    }
    return;
  }
  if (action === 'claim') {
    const failed = (await rows(db, 'audit_log', [['target_id', customerId], ['action', 'claim.failed']], hour)).length;
    if (failed >= limits.failedClaimsPerHour) {
      const reason = `This account has reached ${limits.failedClaimsPerHour} failed payment claims this hour.`;
      await writeRefusal(db, customerId, 'fraud.claim_refused', reason);
      throw new ValidationError('FRAUD_LIMIT', reason);
    }
    return;
  }
  if (action === 'support') {
    const threads = await rows(db, 'support_threads', [['customer_id', customerId]]);
    const ids = new Set(threads.map((row) => String(row.id)));
    const messages = await rows(db, 'support_messages', [], hour);
    const count = messages.filter((row) => ids.has(String(row.thread_id ?? '')) && row.sender === 'customer').length;
    if (ids.size > 0 && count >= limits.supportMessagesPerHour) {
      const reason = `This account has reached ${limits.supportMessagesPerHour} support messages this hour.`;
      await writeRefusal(db, customerId, 'fraud.support_refused', reason);
      throw new ValidationError('FRAUD_LIMIT', reason);
    }
    return;
  }
  const claims = (await rows(db, 'audit_log', [['target_id', customerId], ['action', 'referral.claim']], day)).length;
  if (claims >= limits.referralClaimsPerDay) {
    const reason = `This account has reached ${limits.referralClaimsPerDay} referral claims today.`;
    await writeRefusal(db, customerId, 'fraud.referral_refused', reason);
    throw new ValidationError('FRAUD_LIMIT', reason);
  }
}

export async function noteFailedClaim(db: DbClient, customerId: string, reason: string): Promise<void> {
  await writeRefusal(db, customerId, 'claim.failed', reason);
}

export async function noteReferralClaim(db: DbClient, customerId: string): Promise<void> {
  await writeRefusal(db, customerId, 'referral.claim', 'Referral reward claimed.');
}
