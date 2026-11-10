import { AppError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getStoreConfig } from '@/modules/store-config';
import { generateReferralCode, nextReferralCode } from '@/modules/referrals/codes';
import { attachDecision, orderQualifies, utcDayStart } from '@/modules/referrals/rules';

const ZERO_BOT = '00000000-0000-0000-0000-000000000000';

type CustomerRow = {
  readonly id: string;
  readonly bot_id: string | null;
  readonly referral_code: string | null;
  readonly referred_by_customer_id: string | null;
  readonly first_name: string | null;
  readonly credit_balance: string | number | bigint | null;
  readonly telegram_chat_id: string | null;
  readonly created_at: string;
};

type ReferralRow = {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly referrer_customer_id: string;
  readonly referred_customer_id: string;
  readonly status: string;
  readonly referrer_notified_at: string | null;
};

export type RedeemResult = {
  readonly success: boolean;
  readonly newPoints: number;
  readonly newBalanceMinor: bigint;
  readonly errorCode: string | null;
};

function storeBotKey(botId: string | null): string {
  return botId ?? ZERO_BOT;
}

async function readCustomer(supabase: DbClient, customerId: string): Promise<CustomerRow> {
  const { data, error } = (await supabase.from('customers').select('*').eq('id', customerId).maybeSingle()) as QueryResult<
    CustomerRow | null
  >;
  if (error || !data) {
    throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
  }
  return data;
}

export async function ensureReferralCode(supabase: DbClient, customerId: string): Promise<string> {
  const customer = await readCustomer(supabase, customerId);
  if (customer.referral_code) {
    return customer.referral_code;
  }
  const { data } = (await supabase.from('customers').select('bot_id, referral_code')) as QueryResult<
    Array<{ bot_id: string | null; referral_code: string | null }>
  >;
  const taken = new Set(
    (data ?? [])
      .filter((row) => storeBotKey(row.bot_id) === storeBotKey(customer.bot_id) && row.referral_code)
      .map((row) => row.referral_code as string),
  );
  const code = nextReferralCode(taken, generateReferralCode);
  const updated = (await supabase
    .from('customers')
    .update({ referral_code: code, updated_at: new Date().toISOString() })
    .eq('id', customerId)
    .is('referral_code', null)
    .select('referral_code')) as QueryResult<Array<{ referral_code: string }>>;
  const saved = updated.data?.[0]?.referral_code;
  if (updated.error || !saved) {
    const again = await readCustomer(supabase, customerId);
    if (again.referral_code) {
      return again.referral_code;
    }
    throw new AppError('REFERRAL_CODE_FAILED', updated.error?.message ?? 'Unable to save a referral code', 500);
  }
  return saved;
}

export async function findCustomerByCode(
  supabase: DbClient,
  botId: string | null,
  code: string,
): Promise<CustomerRow | null> {
  let query = supabase.from('customers').select('*').eq('referral_code', code);
  query = botId === null ? query.is('bot_id', null) : query.eq('bot_id', botId);
  const { data, error } = (await query.maybeSingle()) as QueryResult<CustomerRow | null>;
  if (error) {
    throw new AppError('REFERRAL_LOOKUP_FAILED', error.message, 500);
  }
  return data;
}

export async function customerHasVerifiedOrder(supabase: DbClient, customerId: string): Promise<boolean> {
  const { data, error } = (await supabase
    .from('orders')
    .select('id, payment_status, product_id, quoted_retail_price')
    .eq('customer_id', customerId)
    .eq('payment_status', 'verified')) as QueryResult<
    Array<{ id: string; payment_status: string; product_id: string | null; quoted_retail_price: string | number }>
  >;
  if (error) {
    throw new AppError('ORDER_LOOKUP_FAILED', error.message, 500);
  }
  return (data ?? []).some((row) => row.product_id && BigInt(row.quoted_retail_price) > 0n);
}

/**
 * Attaches a new buyer to one referrer in this store. A miss is silent for the buyer.
 */
export async function attachReferral(
  supabase: DbClient,
  input: {
    readonly botId: string | null;
    readonly tenantId: string | null;
    readonly code: string;
    readonly referredId: string;
    readonly referredIsNew: boolean;
  },
): Promise<{ readonly attached: boolean; readonly referrerId: string | null }> {
  const referred = await readCustomer(supabase, input.referredId);
  const referrer = await findCustomerByCode(supabase, input.botId, input.code);
  if (!referrer) {
    return { attached: false, referrerId: null };
  }
  const decision = attachDecision({
    referrerId: referrer.id,
    referredId: referred.id,
    referredIsNew: input.referredIsNew,
    alreadyReferred: referred.referred_by_customer_id !== null && referred.referred_by_customer_id !== undefined,
    hasVerifiedOrder: await customerHasVerifiedOrder(supabase, referred.id),
    sameStore: storeBotKey(referrer.bot_id) === storeBotKey(referred.bot_id),
  });
  if (decision !== 'ok') {
    return { attached: false, referrerId: null };
  }
  const now = new Date().toISOString();
  const marked = (await supabase
    .from('customers')
    .update({ referred_by_customer_id: referrer.id, referred_at: now, updated_at: now })
    .eq('id', referred.id)
    .is('referred_by_customer_id', null)
    .select('id')) as QueryResult<Array<{ id: string }>>;
  if (marked.error || !marked.data?.[0]) {
    return { attached: false, referrerId: null };
  }
  const inserted = await supabase.from('referrals').insert({
    bot_id: input.botId,
    tenant_id: input.tenantId,
    referrer_customer_id: referrer.id,
    referred_customer_id: referred.id,
    status: 'pending',
  });
  if (inserted.error) {
    return { attached: false, referrerId: referrer.id };
  }
  return { attached: true, referrerId: referrer.id };
}

export async function pointsBalance(supabase: DbClient, customerId: string): Promise<number> {
  const { data, error } = (await supabase.from('points_ledger').select('delta').eq('customer_id', customerId)) as QueryResult<
    Array<{ delta: number | string }>
  >;
  if (error) {
    throw new AppError('POINTS_READ_FAILED', error.message, 500);
  }
  return (data ?? []).reduce((sum, row) => sum + Number(row.delta), 0);
}

export async function appendPoints(
  supabase: DbClient,
  input: {
    readonly customerId: string;
    readonly tenantId: string | null;
    readonly delta: number;
    readonly reason: 'referral_reward' | 'redeem_to_wallet' | 'admin_adjust';
    readonly reference: string;
    readonly note?: string;
  },
): Promise<{ readonly created: boolean }> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new AppError('INVALID_POINTS', 'Point changes must be a whole number other than zero.', 400);
  }
  const existing = (await supabase
    .from('points_ledger')
    .select('id')
    .eq('customer_id', input.customerId)
    .eq('reason', input.reason)
    .eq('reference', input.reference)
    .maybeSingle()) as QueryResult<{ id: string } | null>;
  if (existing.data) {
    return { created: false };
  }
  const inserted = await supabase.from('points_ledger').insert({
    customer_id: input.customerId,
    tenant_id: input.tenantId,
    delta: input.delta,
    reason: input.reason,
    reference: input.reference,
    note: input.note ?? null,
  });
  if (inserted.error) {
    if (/duplicate|unique/i.test(inserted.error.message)) {
      return { created: false };
    }
    throw new AppError('POINTS_WRITE_FAILED', inserted.error.message, 500);
  }
  return { created: true };
}

export async function redeemPoints(
  supabase: DbClient,
  input: {
    readonly customerId: string;
    readonly points: number;
    readonly valuePerPointMinor: bigint;
    readonly requestId: string;
    readonly minPoints: number;
  },
): Promise<RedeemResult> {
  const result = (await supabase.rpc('redeem_points_to_wallet', {
    p_customer_id: input.customerId,
    p_points: input.points,
    p_value_per_point: input.valuePerPointMinor.toString(),
    p_request_id: input.requestId,
    p_min_points: input.minPoints,
  })) as QueryResult<Array<{ success: boolean; new_points: number; new_balance: string; error_code: string | null }>>;
  const row = result.data?.[0];
  if (result.error || !row) {
    throw new AppError('REDEEM_FAILED', result.error?.message ?? 'Unable to redeem points', 500);
  }
  return {
    success: row.success,
    newPoints: Number(row.new_points),
    newBalanceMinor: BigInt(row.new_balance),
    errorCode: row.error_code,
  };
}

export type QualifyNotifier = (input: {
  readonly referrerCustomerId: string;
  readonly points: number;
  readonly tenantId: string | null;
}) => Promise<void>;

/**
 * Qualifies pending referrals whose buyer has a verified paid product order.
 * A failure inside one row does not stop the rest.
 */
export async function qualifyPendingReferrals(
  supabase: DbClient,
  now: Date,
  notify: QualifyNotifier = async () => undefined,
): Promise<{ readonly granted: number; readonly capped: number }> {
  const pending = (await supabase.from('referrals').select('*').eq('status', 'pending')) as QueryResult<ReferralRow[]>;
  const unnotified = (await supabase
    .from('referrals')
    .select('*')
    .eq('status', 'qualified')
    .is('referrer_notified_at', null)) as QueryResult<ReferralRow[]>;
  if (pending.error || unnotified.error) {
    throw new AppError('REFERRAL_SWEEP_FAILED', pending.error?.message ?? unnotified.error?.message ?? 'Unable to read referrals', 500);
  }
  let granted = 0;
  let capped = 0;
  for (const referral of pending.data ?? []) {
    try {
      const outcome = await qualifyOne(supabase, referral, now, notify);
      granted += outcome === 'granted' ? 1 : 0;
      capped += outcome === 'capped' ? 1 : 0;
    } catch {
      // The next sweep retries this row.
    }
  }
  for (const referral of unnotified.data ?? []) {
    try {
      const config = (await getStoreConfig(supabase, referral.tenant_id)).config.referrals;
      await notify({
        referrerCustomerId: referral.referrer_customer_id,
        points: config.pointsPerReferral,
        tenantId: referral.tenant_id,
      });
      await supabase.from('referrals').update({ referrer_notified_at: new Date().toISOString() }).eq('id', referral.id);
    } catch {
      // Leave the flag empty so the next sweep tells them once.
    }
  }
  return { granted, capped };
}

async function qualifyOne(
  supabase: DbClient,
  referral: ReferralRow,
  now: Date,
  notify: QualifyNotifier,
): Promise<'granted' | 'capped' | 'waiting'> {
  const config = (await getStoreConfig(supabase, referral.tenant_id)).config.referrals;
  if (!config.enabled) {
    return 'waiting';
  }
  const orders = (await supabase
    .from('orders')
    .select('id, quoted_retail_price, product_id, payment_status, customer_id')
    .eq('customer_id', referral.referred_customer_id)
    .eq('payment_status', 'verified')) as QueryResult<
    Array<{ id: string; quoted_retail_price: string | number; product_id: string | null }>
  >;
  const minimum = BigInt(config.minQualifyingOrderMinor);
  const match = (orders.data ?? []).find(
    (order) => order.product_id && orderQualifies(BigInt(order.quoted_retail_price), minimum),
  );
  if (!match) {
    return 'waiting';
  }
  const day = utcDayStart(now).toISOString();
  const result = (await supabase.rpc('grant_referral_reward', {
    p_referral_id: referral.id,
    p_points: config.pointsPerReferral,
    p_daily_cap: config.dailyRewardCap,
    p_day_start: day,
    p_order_id: match.id,
  })) as QueryResult<Array<{ granted: boolean; capped: boolean; already: boolean }>>;
  const row = result.data?.[0];
  if (result.error || !row) {
    throw new AppError('REFERRAL_GRANT_FAILED', result.error?.message ?? 'Unable to grant the referral', 500);
  }
  if (row.capped) {
    return 'capped';
  }
  if (!row.granted) {
    return 'waiting';
  }
  if (!referral.referrer_notified_at) {
    try {
      await notify({
        referrerCustomerId: referral.referrer_customer_id,
        points: config.pointsPerReferral,
        tenantId: referral.tenant_id,
      });
      await supabase
        .from('referrals')
        .update({ referrer_notified_at: new Date().toISOString() })
        .eq('id', referral.id);
    } catch {
      // Leave referrer_notified_at empty so the next sweep can tell them once.
    }
  }
  return 'granted';
}
