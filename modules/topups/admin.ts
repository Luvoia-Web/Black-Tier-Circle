/**
 * Owner and reseller review of wallet top-ups.
 * A credit always goes through credit_wallet_topup.
 */

import { randomUUID } from 'crypto';
import { normalizeEthAddress, verifyUsdtTransfer, bep20MinConfirmations, type VerifyUsdtTransferResult } from '@/integrations/bsc/verify';
import { AppError, ValidationError } from '@/lib/errors';
import { minorToUsdt, usdtToMinor } from '@/lib/money';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { TX_HASH_REGEX } from '@/lib/validations/payments';
import { resolveOrderPayments } from '@/modules/payments/resolve';

const PAGE_SIZE = 20;
const READ_CAP = 1000;

type TopupRow = {
  readonly id: string;
  readonly customer_id: string;
  readonly tenant_id: string | null;
  readonly pay_to_address?: string | null;
  readonly amount_expected_minor: string | number;
  readonly credited_amount_minor?: string | number | null;
  readonly status: string;
  readonly tx_hash?: string | null;
  readonly created_at: string;
  readonly expires_at: string;
  readonly credited_at?: string | null;
  readonly reject_reason?: string | null;
};

export type TopupListItem = {
  readonly id: string;
  readonly buyer: string;
  readonly status: string;
  readonly amount: string;
  readonly creditedAmount: string | null;
  readonly txHash: string | null;
  readonly explorerUrl: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly creditedAt: string | null;
  readonly rejectReason: string | null;
};

export type TopupHealth = {
  readonly address: string | null;
  readonly addressValid: boolean;
  readonly provider: 'ok' | 'down';
  readonly confirmations: number;
};

function asMinor(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  return 0n;
}

function explorer(hash: string | null | undefined): string | null {
  if (!hash || !TX_HASH_REGEX.test(hash)) {
    return null;
  }
  return `https://bscscan.com/tx/${hash}`;
}

async function namesFor(supabase: DbClient, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const names = new Map<string, string>();
  if (unique.length === 0) {
    return names;
  }
  const result = (await supabase.from('customers').select('id, first_name').in('id', unique)) as QueryResult<
    Array<{ id: string; first_name: string | null }>
  >;
  for (const row of result.data ?? []) {
    const name = row.first_name?.trim();
    if (name) {
      names.set(row.id, name);
    }
  }
  return names;
}

export async function listWalletTopups(
  supabase: DbClient,
  tenantId: string | null,
  input: { readonly status?: string; readonly query?: string; readonly page?: number },
): Promise<{ readonly rows: TopupListItem[]; readonly page: number; readonly hasMore: boolean }> {
  const page = input.page && input.page > 0 ? Math.floor(input.page) : 1;
  let query = supabase.from('wallet_topups').select('*').order('created_at', { ascending: false }).limit(READ_CAP);
  query = tenantId === null ? query.is('tenant_id', null) : query.eq('tenant_id', tenantId);
  if (input.status && input.status !== 'all') {
    query = query.eq('status', input.status);
  }
  const result = (await query) as QueryResult<TopupRow[]>;
  if (result.error) {
    throw new AppError('TOPUP_READ_FAILED', result.error.message, 500);
  }
  const needle = input.query?.trim().toLowerCase() ?? '';
  const names = await namesFor(supabase, (result.data ?? []).map((row) => row.customer_id));
  const filtered = (result.data ?? []).filter((row) => {
    if (needle.length === 0) {
      return true;
    }
    const buyer = (names.get(row.customer_id) ?? '').toLowerCase();
    const hash = (row.tx_hash ?? '').toLowerCase();
    return buyer.includes(needle) || hash.includes(needle) || row.id.toLowerCase().includes(needle);
  });
  const start = (page - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  return {
    page,
    hasMore: start + PAGE_SIZE < filtered.length,
    rows: slice.map((row) => ({
      id: row.id,
      buyer: names.get(row.customer_id) ?? 'Buyer',
      status: row.status,
      amount: `${minorToUsdt(asMinor(row.amount_expected_minor))} USDT`,
      creditedAmount:
        row.credited_amount_minor === null || row.credited_amount_minor === undefined
          ? null
          : `${minorToUsdt(asMinor(row.credited_amount_minor))} USDT`,
      txHash: row.tx_hash ?? null,
      explorerUrl: explorer(row.tx_hash),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      creditedAt: row.credited_at ?? null,
      rejectReason: row.reject_reason ?? null,
    })),
  };
}

export async function topupHealth(
  supabase: DbClient,
  tenantId: string | null,
  probe: () => Promise<'ok' | 'down'> = async () => 'down',
): Promise<TopupHealth> {
  const resolved = await resolveOrderPayments(supabase, tenantId);
  const address = normalizeEthAddress(resolved.bep20Address ?? '');
  const provider = address ? await probe() : 'down';
  return {
    address,
    addressValid: address !== null,
    provider,
    confirmations: bep20MinConfirmations(),
  };
}

async function loadScoped(supabase: DbClient, tenantId: string | null, topupId: string): Promise<TopupRow> {
  let query = supabase.from('wallet_topups').select('*').eq('id', topupId);
  query = tenantId === null ? query.is('tenant_id', null) : query.eq('tenant_id', tenantId);
  const result = (await query.maybeSingle()) as QueryResult<TopupRow | null>;
  if (result.error) {
    throw new AppError('TOPUP_READ_FAILED', result.error.message, 500);
  }
  if (!result.data) {
    throw new ValidationError('TOPUP_NOT_FOUND', 'That top-up is not in this store.');
  }
  return result.data;
}

async function writeAudit(
  supabase: DbClient,
  input: {
    readonly actorId: string;
    readonly tenantId: string | null;
    readonly topupId: string;
    readonly action: string;
    readonly reason: string;
    readonly after: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: input.actorId,
    tenant_id: input.tenantId,
    action: input.action,
    target_type: 'wallet_topup',
    target_id: input.topupId,
    after_val: input.after,
    reason: input.reason,
  });
  if (error) {
    throw new AppError('AUDIT_WRITE_FAILED', error.message, 500);
  }
}

function parseVerifiedAmount(raw: string | undefined): bigint | null {
  if (raw === undefined || raw.trim() === '') {
    return null;
  }
  try {
    const amount = usdtToMinor(raw.trim());
    if (amount <= 0n) {
      throw new ValidationError('INVALID_AMOUNT', 'Enter the verified USDT amount.');
    }
    return amount;
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('INVALID_AMOUNT', 'Enter the verified USDT amount, for example 10.004200.');
  }
}

function rpcRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const row = data[0];
    return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
  }
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>;
  }
  return null;
}

export async function reviewWalletTopup(
  supabase: DbClient,
  input: {
    readonly actorId: string;
    readonly tenantId: string | null;
    readonly topupId: string;
    readonly decision: 'approve' | 'reject';
    readonly reason: string;
    readonly txHash?: string;
    readonly verifiedAmount?: string;
  },
  verify: typeof verifyUsdtTransfer = verifyUsdtTransfer,
): Promise<{ readonly success: boolean; readonly repeated: boolean; readonly balance: string | null; readonly errorCode: string | null }> {
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) {
    throw new ValidationError('REASON_REQUIRED', 'Enter a reason between 10 and 500 characters.');
  }
  const topup = await loadScoped(supabase, input.tenantId, input.topupId);
  if (input.decision === 'reject') {
    if (topup.status !== 'pending') {
      throw new ValidationError('NOT_PENDING', 'Only a pending top-up can be rejected.');
    }
    const updated = (await supabase
      .from('wallet_topups')
      .update({ status: 'rejected', reject_reason: reason })
      .eq('id', topup.id)
      .eq('status', 'pending')
      .select('*')) as QueryResult<TopupRow[]>;
    if (updated.error || (updated.data ?? []).length === 0) {
      throw new ValidationError('NOT_PENDING', 'Only a pending top-up can be rejected.');
    }
    await writeAudit(supabase, {
      actorId: input.actorId,
      tenantId: input.tenantId,
      topupId: topup.id,
      action: 'topup.reject',
      reason,
      after: { status: 'rejected' },
    });
    return { success: true, repeated: false, balance: null, errorCode: null };
  }

  const typed = input.txHash?.trim().toLowerCase() ?? '';
  const hash = typed.length > 0 ? typed : `manual:${randomUUID()}`;
  if (topup.status === 'credited' && topup.tx_hash === hash) {
    return { success: true, repeated: true, balance: null, errorCode: null };
  }
  if (topup.status !== 'pending') {
    throw new ValidationError('NOT_PENDING', 'Only a pending top-up can be approved.');
  }
  if (new Date(topup.expires_at).getTime() <= Date.now()) {
    await supabase.from('wallet_topups').update({ status: 'expired', reject_reason: 'EXPIRED' }).eq('id', topup.id).eq('status', 'pending');
    throw new ValidationError('EXPIRED', 'This top-up expired before it was approved.');
  }

  const expected = asMinor(topup.amount_expected_minor);
  const typedAmount = parseVerifiedAmount(input.verifiedAmount);
  const amount = typedAmount ?? expected;
  if (typed.length > 0) {
    if (!TX_HASH_REGEX.test(typed)) {
      throw new ValidationError('INVALID_HASH', 'Paste the transaction hash, or leave it blank for a manual credit.');
    }
    const stored = normalizeEthAddress(topup.pay_to_address ?? '');
    const resolved = stored ? null : await resolveOrderPayments(supabase, input.tenantId);
    const address = stored ?? normalizeEthAddress(resolved?.bep20Address ?? '');
    if (!address) {
      throw new ValidationError('PAYMENTS_UNAVAILABLE', 'Save a valid public BEP20 address before approving a chain payment.');
    }
    const chain: VerifyUsdtTransferResult = await verify({
      txHash: typed,
      toAddress: address,
      exactAmountMinor: amount,
      notBefore: new Date(topup.created_at),
    });
    if (chain.status !== 'verified') {
      throw new ValidationError(chain.reason, 'The chain check did not confirm this transfer.');
    }
    if (chain.amountMinor !== amount) {
      throw new ValidationError(
        'AMOUNT_MISMATCH',
        'The amount on the chain does not match the verified amount you typed.',
      );
    }
  }

  const rpc = await supabase.rpc('credit_wallet_topup', {
    p_topup_id: topup.id,
    p_tx_hash: hash,
    p_amount_minor: amount.toString(),
    p_network: 'bep20',
    p_exact: amount === expected,
  });
  if (rpc.error) {
    throw new AppError('TOPUP_CREDIT_FAILED', 'The credit could not be saved.', 503);
  }
  const row = rpcRow(rpc.data);
  const success = row?.success === true;
  const errorCode = typeof row?.error_code === 'string' ? row.error_code : null;
  if (!success) {
    return { success: false, repeated: false, balance: null, errorCode };
  }
  await writeAudit(supabase, {
    actorId: input.actorId,
    tenantId: input.tenantId,
    topupId: topup.id,
    action: 'topup.approve',
    reason,
    after: { txHash: hash, amountMinor: amount.toString() },
  });
  return {
    success: true,
    repeated: false,
    balance: typeof row?.new_balance === 'string' ? row.new_balance : null,
    errorCode: null,
  };
}
