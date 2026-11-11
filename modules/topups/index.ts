/**
 * @file modules/topups/index.ts
 *
 * Buyer wallet top-ups. Creating a row does not credit anyone.
 * A credit happens only inside credit_wallet_topup after this module has
 * already checked the chain.
 *
 * @module Topups
 */

import { verifyUsdtTransfer, type VerifyUsdtTransferResult } from '@/integrations/bsc/verify';
import { AppError, ValidationError } from '@/lib/errors';
import { usdtToMinor } from '@/lib/money';
import { OWNER_STORE_BOT_ID } from '@/lib/owner-bot';
import type { DbClient, QueryResult } from '@/lib/supabase/query';

export const TOPUP_FLOOR_MINOR = 1_000_000n;
export const TOPUP_DEFAULT_MAX_MINOR = 10_000_000_000n;
export const TOPUP_WINDOW_MS = 30 * 60 * 1000;

export type TopupStatus = 'pending' | 'credited' | 'expired' | 'failed' | 'rejected';

export type WalletTopup = {
  readonly id: string;
  readonly customerId: string;
  readonly botId: string | null;
  readonly tenantId: string | null;
  readonly amountExpectedMinor: bigint;
  readonly creditedAmountMinor: bigint | null;
  readonly status: TopupStatus;
  readonly txHash: string | null;
  readonly network: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly creditedAt: Date | null;
  readonly rejectReason: string | null;
};

export type TopupLimits = {
  readonly min: bigint;
  readonly max: bigint;
};

export type ClaimTopupResult =
  | {
      readonly status: 'credited';
      readonly repeated: boolean;
      readonly amountMinor: bigint;
      readonly newBalance: bigint;
      readonly topup: WalletTopup;
    }
  | {
      readonly status: 'rejected';
      readonly reason: string;
      readonly confirmations?: number;
      readonly amountMinor?: bigint;
    }
  | { readonly status: 'unavailable' };

type TopupRow = {
  readonly id?: string;
  readonly customer_id?: string;
  readonly bot_id?: string | null;
  readonly tenant_id?: string | null;
  readonly amount_expected_minor?: string | number | bigint;
  readonly credited_amount_minor?: string | number | bigint | null;
  readonly status?: string;
  readonly tx_hash?: string | null;
  readonly network?: string;
  readonly created_at?: string;
  readonly expires_at?: string;
  readonly credited_at?: string | null;
  readonly reject_reason?: string | null;
};

const STATUSES = new Set<TopupStatus>(['pending', 'credited', 'expired', 'failed', 'rejected']);

function asMinor(value: unknown, fallback = 0n): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  return fallback;
}

function asStatus(value: string | undefined): TopupStatus {
  if (value && STATUSES.has(value as TopupStatus)) {
    return value as TopupStatus;
  }
  return 'failed';
}

function mapTopup(row: TopupRow): WalletTopup | null {
  if (!row.id || !row.customer_id || !row.created_at || !row.expires_at) {
    return null;
  }
  return {
    id: row.id,
    customerId: row.customer_id,
    botId: row.bot_id ?? null,
    tenantId: row.tenant_id ?? null,
    amountExpectedMinor: asMinor(row.amount_expected_minor),
    creditedAmountMinor:
      row.credited_amount_minor === null || row.credited_amount_minor === undefined
        ? null
        : asMinor(row.credited_amount_minor),
    status: asStatus(row.status),
    txHash: row.tx_hash ?? null,
    network: row.network ?? 'bep20',
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    creditedAt: row.credited_at ? new Date(row.credited_at) : null,
    rejectReason: row.reject_reason ?? null,
  };
}

function rpcRecord(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const row = data[0];
    return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
  }
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>;
  }
  return null;
}

function dollarsToMinor(raw: unknown): bigint | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return null;
  }
  try {
    return usdtToMinor(String(raw).trim());
  } catch {
    return null;
  }
}

/**
 * Store top-up bounds. The floor is 1.00 USDT even when a store saved less.
 */
export async function loadTopupLimits(supabase: DbClient, tenantId: string | null): Promise<TopupLimits> {
  if (tenantId === null) {
    const result = (await supabase.from('platform_settings').select('*').limit(1).maybeSingle()) as QueryResult<
      Record<string, unknown> | null
    >;
    const row = result.data;
    const min = asMinor(row?.min_topup_minor, TOPUP_FLOOR_MINOR);
    const max = asMinor(row?.max_topup_minor, TOPUP_DEFAULT_MAX_MINOR);
    const floor = min < TOPUP_FLOOR_MINOR ? TOPUP_FLOOR_MINOR : min;
    return { min: floor, max: max < floor ? floor : max };
  }
  const result = (await supabase
    .from('tenant_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()) as QueryResult<Record<string, unknown> | null>;
  const row = result.data;
  const fromSetting = dollarsToMinor(row?.usdt_minimum_bep20);
  const min = fromSetting === null || fromSetting < TOPUP_FLOOR_MINOR ? TOPUP_FLOOR_MINOR : fromSetting;
  const max = asMinor(row?.max_topup_minor, TOPUP_DEFAULT_MAX_MINOR);
  return { min, max: max < min ? min : max };
}

export function assertTopupAmount(amountMinor: bigint, limits: TopupLimits): void {
  if (amountMinor < limits.min) {
    throw new ValidationError('TOPUP_BELOW_MINIMUM', 'The minimum top-up is 1.00 USDT');
  }
  if (amountMinor > limits.max) {
    throw new ValidationError('TOPUP_ABOVE_MAXIMUM', 'That amount is above the maximum for this store');
  }
}

export async function findLatestTopup(supabase: DbClient, customerId: string): Promise<WalletTopup | null> {
  const result = (await supabase
    .from('wallet_topups')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as QueryResult<TopupRow | null>;
  if (result.error || !result.data) {
    return null;
  }
  return mapTopup(result.data);
}

export async function findOpenTopup(supabase: DbClient, customerId: string): Promise<WalletTopup | null> {
  const result = (await supabase
    .from('wallet_topups')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'pending')
    .maybeSingle()) as QueryResult<TopupRow | null>;
  if (result.error || !result.data) {
    return null;
  }
  return mapTopup(result.data);
}

async function expireRow(supabase: DbClient, topupId: string): Promise<void> {
  await supabase
    .from('wallet_topups')
    .update({ status: 'expired', reject_reason: 'EXPIRED' })
    .eq('id', topupId)
    .eq('status', 'pending');
}

/**
 * Reuses the buyer's open top-up. A second pending row is never inserted.
 */
export async function openWalletTopup(
  supabase: DbClient,
  input: {
    readonly customerId: string;
    readonly botId: string;
    readonly tenantId: string | null;
    readonly amountMinor: bigint;
    readonly now?: Date;
  },
): Promise<{ readonly topup: WalletTopup; readonly reused: boolean }> {
  const limits = await loadTopupLimits(supabase, input.tenantId);
  assertTopupAmount(input.amountMinor, limits);
  const now = input.now ?? new Date();
  const existing = await findOpenTopup(supabase, input.customerId);
  if (existing) {
    if (existing.expiresAt.getTime() <= now.getTime()) {
      await expireRow(supabase, existing.id);
    } else {
      return { topup: existing, reused: true };
    }
  }
  const botId = input.botId === OWNER_STORE_BOT_ID ? null : input.botId;
  const created = (await supabase
    .from('wallet_topups')
    .insert({
      customer_id: input.customerId,
      bot_id: botId,
      tenant_id: input.tenantId,
      amount_expected_minor: input.amountMinor.toString(),
      status: 'pending',
      network: 'bep20',
      expires_at: new Date(now.getTime() + TOPUP_WINDOW_MS).toISOString(),
    })
    .select('*')
    .single()) as QueryResult<TopupRow | null>;
  if (created.error || !created.data) {
    const again = await findOpenTopup(supabase, input.customerId);
    if (again) {
      return { topup: again, reused: true };
    }
    throw new AppError('TOPUP_CREATE_FAILED', created.error?.message ?? 'Could not start the top-up', 500);
  }
  const topup = mapTopup(created.data);
  if (!topup) {
    throw new AppError('TOPUP_CREATE_FAILED', 'Could not start the top-up', 500);
  }
  return { topup, reused: false };
}

export async function getTopup(supabase: DbClient, topupId: string): Promise<WalletTopup | null> {
  const result = (await supabase.from('wallet_topups').select('*').eq('id', topupId).maybeSingle()) as QueryResult<
    TopupRow | null
  >;
  if (result.error || !result.data) {
    return null;
  }
  return mapTopup(result.data);
}

/**
 * Verifies a BEP20 transfer, then credits whatever was actually received.
 * The database function refuses a second credit for the same top-up or hash.
 */
export async function claimWalletTopup(
  supabase: DbClient,
  input: {
    readonly customerId: string;
    readonly txHash: string;
    readonly toAddress: string;
    readonly topupId?: string;
  },
  verify: typeof verifyUsdtTransfer = verifyUsdtTransfer,
): Promise<ClaimTopupResult> {
  const hash = input.txHash.trim().toLowerCase();
  const open = input.topupId ? await getTopup(supabase, input.topupId) : await findOpenTopup(supabase, input.customerId);
  const latest = open ?? (await findLatestTopup(supabase, input.customerId));
  const topup = latest && latest.customerId === input.customerId ? latest : null;
  if (!topup || (topup.status === 'credited' && topup.txHash !== hash)) {
    return { status: 'rejected', reason: 'NO_OPEN_TOPUP' };
  }
  if (topup.status === 'credited' && topup.txHash === hash) {
    return creditVerifiedTopup(supabase, topup, hash, topup.creditedAmountMinor ?? topup.amountExpectedMinor, true);
  }
  if (topup.status === 'expired' || (topup.status === 'pending' && topup.expiresAt.getTime() <= Date.now())) {
    if (topup.status === 'pending') {
      await expireRow(supabase, topup.id);
    }
    return { status: 'rejected', reason: 'EXPIRED' };
  }
  if (topup.status !== 'pending' && topup.status !== 'credited') {
    return { status: 'rejected', reason: 'NOT_PENDING' };
  }

  const chain: VerifyUsdtTransferResult = await verify({
    txHash: input.txHash.trim(),
    toAddress: input.toAddress,
    minAmountMinor: topup.amountExpectedMinor,
    notBefore: topup.createdAt,
  });
  if (chain.status === 'unavailable') {
    return { status: 'unavailable' };
  }
  if (chain.status === 'rejected') {
    return {
      status: 'rejected',
      reason: chain.reason,
      ...(chain.confirmations !== undefined ? { confirmations: chain.confirmations } : {}),
      ...(chain.amountMinor !== undefined ? { amountMinor: chain.amountMinor } : {}),
    };
  }

  return creditVerifiedTopup(supabase, topup, input.txHash.trim(), chain.amountMinor, false);
}

async function creditVerifiedTopup(
  supabase: DbClient,
  topup: WalletTopup,
  txHash: string,
  amountMinor: bigint,
  repeated: boolean,
): Promise<ClaimTopupResult> {
  const rpc = await supabase.rpc('credit_wallet_topup', {
    p_topup_id: topup.id,
    p_tx_hash: txHash,
    p_amount_minor: amountMinor.toString(),
    p_network: 'bep20',
  });
  if (rpc.error) {
    return { status: 'unavailable' };
  }
  const row = rpcRecord(rpc.data);
  const success = row?.success === true;
  const code = typeof row?.error_code === 'string' ? row.error_code : null;
  if (!success) {
    return { status: 'rejected', reason: code ?? 'CREDIT_FAILED', amountMinor };
  }
  const updated = await getTopup(supabase, topup.id);
  return {
    status: 'credited',
    repeated: repeated || topup.status === 'credited',
    amountMinor: updated?.creditedAmountMinor ?? amountMinor,
    newBalance: asMinor(row?.new_balance),
    topup: updated ?? { ...topup, status: 'credited', creditedAmountMinor: amountMinor, txHash: txHash.toLowerCase() },
  };
}

/**
 * Marks pending top-ups whose window has closed. Safe to run more than once.
 */
export async function expirePendingTopups(supabase: DbClient, now = new Date()): Promise<number> {
  const listed = (await supabase.from('wallet_topups').select('*').eq('status', 'pending')) as QueryResult<
    TopupRow[] | null
  >;
  if (listed.error || !Array.isArray(listed.data)) {
    throw new AppError('TOPUP_SWEEP_FAILED', listed.error?.message ?? 'Could not read top-ups', 500);
  }
  let count = 0;
  for (const row of listed.data) {
    const topup = mapTopup(row);
    if (!topup || topup.expiresAt.getTime() > now.getTime()) {
      continue;
    }
    await expireRow(supabase, topup.id);
    count += 1;
  }
  return count;
}
