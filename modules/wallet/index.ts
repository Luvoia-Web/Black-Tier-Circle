/**
 * @file modules/wallet/index.ts
 *
 * Public API for the wallet module.
 * All balance mutations go through Postgres RPC functions — never direct UPDATE.
 *
 * SECURITY: Every function that takes a tenantId validates it from the
 * server session before operating. Never trust a tenantId from the client.
 *
 * INVARIANT: balanceTotal >= balanceReserved >= 0 at all times.
 * The Postgres functions enforce this — any violation throws an error.
 *
 * @module Wallet
 */

import { AppError, NotFoundError, ValidationError, WalletError } from '@/lib/errors';
import { generateTopupToken } from '@/lib/tokens';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { asMinorUnits, mapTopupTokenRow, mapWalletRow, toPublicTopupToken } from './map';
import type {
  AdminWalletListItem,
  CreateTopupTokenInput,
  RedeemTokenResult,
  TokenStatus,
  TopupToken,
  TopupTokenRow,
  Wallet,
  WalletRow,
} from './types';

export type {
  AdminWalletListItem,
  CreateTopupTokenInput,
  LedgerEntry,
  LedgerEntryType,
  LedgerListOptions,
  RedeemTokenResult,
  TokenStatus,
  TopupToken,
  Wallet,
  WalletReservation,
  WalletStatement,
} from './types';
export { getLedgerEntries, getRunningBalance, getWalletStatement } from './ledger';
export { maskTopupToken, toPublicTopupToken } from './map';

function asWalletRow(data: unknown): WalletRow {
  return data as WalletRow;
}

function asTokenRow(data: unknown): TopupTokenRow {
  return data as TopupTokenRow;
}

function firstRpcRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const row = data[0];
    return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
  }
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>;
  }
  return null;
}

function rpcBool(value: unknown): boolean {
  return value === true;
}

function rpcErrorCode(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function rpcMinor(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return asMinorUnits(value);
  }
  return 0n;
}

async function writeAuditLog(
  supabase: DbClient,
  entry: {
    readonly actorId: string;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly tenantId?: string;
    readonly afterVal?: Record<string, unknown>;
    readonly reason?: string;
  },
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: entry.actorId,
    tenant_id: entry.tenantId ?? null,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    after_val: entry.afterVal ?? null,
    reason: entry.reason ?? null,
  });
  if (error) {
    throw new AppError('AUDIT_WRITE_FAILED', error.message, 500);
  }
}

/**
 * Loads a wallet by tenant ID and computes available balance.
 *
 * @param supabase - Database client
 * @param tenantId - Tenant UUID from the verified session
 */
export async function getWallet(supabase: DbClient, tenantId: string): Promise<Wallet> {
  const { data, error } = await supabase.from('wallets').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (error) {
    throw new AppError('WALLET_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('Wallet');
  }
  return mapWalletRow(asWalletRow(data));
}

/**
 * Loads a wallet by primary key.
 *
 * @param supabase - Database client
 * @param walletId - Wallet UUID
 */
export async function getWalletById(supabase: DbClient, walletId: string): Promise<Wallet> {
  const { data, error } = await supabase.from('wallets').select('*').eq('id', walletId).maybeSingle();
  if (error) {
    throw new AppError('WALLET_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('Wallet');
  }
  return mapWalletRow(asWalletRow(data));
}

/**
 * Gets an existing wallet or creates one via create_wallet RPC.
 * Called when owner activates a reseller tenant.
 *
 * @param supabase - Service-role database client
 * @param tenantId - Tenant UUID
 */
export async function getOrCreateWallet(supabase: DbClient, tenantId: string): Promise<Wallet> {
  const existing = await supabase.from('wallets').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (existing.error) {
    throw new AppError('WALLET_LOOKUP_FAILED', existing.error.message, 500);
  }
  if (existing.data !== null) {
    return mapWalletRow(asWalletRow(existing.data));
  }

  const created = await supabase.rpc('create_wallet', { p_tenant_id: tenantId });
  if (created.error) {
    throw new AppError('WALLET_CREATE_FAILED', created.error.message, 500);
  }
  return getWallet(supabase, tenantId);
}

/**
 * Owner only: generates a cryptographically random 12-digit token and stores it.
 * The full token value is returned only from this function.
 *
 * @param supabase - Service-role database client
 * @param actorId - Owner profile ID
 * @param input - Amount, optional tenant restriction, optional expiry
 */
export async function createTopupToken(
  supabase: DbClient,
  actorId: string,
  input: CreateTopupTokenInput,
): Promise<TopupToken> {
  if (input.amountUsdt <= 0n) {
    throw new ValidationError('INVALID_AMOUNT', 'Token amount must be greater than zero');
  }

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateTopupToken();
    const { data, error } = await supabase
      .from('topup_tokens')
      .insert({
        token,
        amount_usdt: input.amountUsdt.toString(),
        status: 'active',
        tenant_id: input.tenantId ?? null,
        created_by: actorId,
        expires_at: input.expiresAt === undefined ? null : input.expiresAt.toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      lastError = error.message;
      continue;
    }
    if (data === null) {
      lastError = 'Unable to create token';
      continue;
    }

    const created = mapTopupTokenRow(asTokenRow(data));
    await writeAuditLog(supabase, {
      actorId,
      action: 'topup_token.create',
      targetType: 'topup_token',
      targetId: created.id,
      ...(created.tenantId ? { tenantId: created.tenantId } : {}),
      afterVal: {
        amountUsdt: created.amountUsdt.toString(),
        tenantId: created.tenantId,
        expiresAt: created.expiresAt?.toISOString() ?? null,
      },
    });
    return created;
  }

  throw new AppError('TOKEN_CREATE_FAILED', lastError ?? 'Unable to create unique token', 500);
}

/**
 * Owner only: list tokens. Full token values are masked.
 *
 * @param supabase - Service-role database client
 * @param filters - Optional status and tenant filters
 */
export async function listTopupTokens(
  supabase: DbClient,
  filters?: { status?: TokenStatus; tenantId?: string },
): Promise<TopupToken[]> {
  let query = supabase.from('topup_tokens').select('*').order('created_at', { ascending: false });
  if (filters?.status !== undefined) {
    query = query.eq('status', filters.status);
  }
  if (filters?.tenantId !== undefined) {
    query = query.eq('tenant_id', filters.tenantId);
  }
  const result = (await query) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('TOKEN_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => toPublicTopupToken(mapTopupTokenRow(asTokenRow(row))));
}

/**
 * Owner only: revokes an active token so it can no longer be redeemed.
 *
 * @param supabase - Service-role database client
 * @param tokenId - Token UUID
 * @param actorId - Owner profile ID
 */
export async function revokeTopupToken(
  supabase: DbClient,
  tokenId: string,
  actorId: string,
): Promise<TopupToken> {
  const existing = await supabase.from('topup_tokens').select('*').eq('id', tokenId).maybeSingle();
  if (existing.error) {
    throw new AppError('TOKEN_LOOKUP_FAILED', existing.error.message, 500);
  }
  if (existing.data === null) {
    throw new NotFoundError('Top-up token');
  }
  const current = mapTopupTokenRow(asTokenRow(existing.data));
  if (current.status !== 'active') {
    throw new ValidationError('TOKEN_NOT_ACTIVE', 'Only active tokens can be revoked');
  }

  const { data, error } = await supabase
    .from('topup_tokens')
    .update({ status: 'revoked' })
    .eq('id', tokenId)
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('TOKEN_REVOKE_FAILED', error?.message ?? 'Unable to revoke token', 500);
  }

  const revoked = toPublicTopupToken(mapTopupTokenRow(asTokenRow(data)));
  await writeAuditLog(supabase, {
    actorId,
    action: 'topup_token.revoke',
    targetType: 'topup_token',
    targetId: revoked.id,
    ...(revoked.tenantId ? { tenantId: revoked.tenantId } : {}),
    afterVal: { status: 'revoked' },
  });
  return revoked;
}

/**
 * Reseller use: redeem a token by calling redeem_topup_token RPC.
 * Never throws on business errors (wrong token, expired) — returns error code.
 *
 * @param supabase - Service-role database client
 * @param token - 12-digit token
 * @param tenantId - Tenant ID from session
 * @param userId - Redeemer profile ID
 */
export async function redeemTopupToken(
  supabase: DbClient,
  token: string,
  tenantId: string,
  userId: string,
): Promise<RedeemTokenResult> {
  const { data, error } = await supabase.rpc('redeem_topup_token', {
    p_token: token,
    p_tenant_id: tenantId,
    p_redeemed_by: userId,
  });
  if (error) {
    throw new AppError('TOKEN_REDEEM_FAILED', error.message, 500);
  }
  const row = firstRpcRow(data);
  if (row === null) {
    throw new AppError('TOKEN_REDEEM_FAILED', 'Empty RPC response', 500);
  }
  if (!rpcBool(row.success)) {
    return { success: false, errorCode: rpcErrorCode(row.error_code) ?? 'TOKEN_REDEEM_FAILED' };
  }
  return {
    success: true,
    amountCredited: rpcMinor(row.amount_credited),
    newBalance: rpcMinor(row.new_balance),
  };
}

/**
 * Credits a customer's balance from an unrestricted top-up token.
 * Store-wallet tokens (tenant_id set) are left untouched and reported back.
 *
 * @param supabase - Service-role database client
 * @param token - 12-digit token
 * @param customerId - Customer UUID
 */
export async function redeemCustomerCreditToken(
  supabase: DbClient,
  token: string,
  customerId: string,
): Promise<RedeemTokenResult> {
  const existing = await supabase.from('topup_tokens').select('*').eq('token', token).maybeSingle();
  if (existing.error) {
    throw new AppError('TOKEN_REDEEM_FAILED', existing.error.message, 500);
  }
  if (existing.data === null) {
    return { success: false, errorCode: 'TOKEN_NOT_FOUND' };
  }
  const current = mapTopupTokenRow(asTokenRow(existing.data));
  if (current.status === 'redeemed') {
    return { success: false, errorCode: 'TOKEN_REDEEMED' };
  }
  if (current.status === 'revoked') {
    return { success: false, errorCode: 'TOKEN_REVOKED' };
  }
  if (current.status === 'expired' || (current.expiresAt !== null && current.expiresAt.getTime() <= Date.now())) {
    return { success: false, errorCode: 'TOKEN_EXPIRED' };
  }
  if (current.status !== 'active') {
    return { success: false, errorCode: 'TOKEN_REVOKED' };
  }
  if (current.tenantId !== null) {
    return { success: false, errorCode: 'TOKEN_IS_STORE_WALLET', storeTenantId: current.tenantId };
  }

  const claimed = await supabase
    .from('topup_tokens')
    .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
    .eq('id', current.id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (claimed.error) {
    throw new AppError('TOKEN_REDEEM_FAILED', claimed.error.message, 500);
  }
  if (claimed.data === null) {
    return { success: false, errorCode: 'TOKEN_REDEEMED' };
  }

  const credited = await supabase.rpc('adjust_customer_credit', {
    p_customer_id: customerId,
    p_delta: current.amountUsdt.toString(),
  });
  if (credited.error) {
    await supabase
      .from('topup_tokens')
      .update({ status: 'active', redeemed_at: null })
      .eq('id', current.id);
    throw new AppError('TOKEN_REDEEM_FAILED', credited.error.message, 500);
  }
  const row = firstRpcRow(credited.data);
  if (row === null || !rpcBool(row.success)) {
    await supabase
      .from('topup_tokens')
      .update({ status: 'active', redeemed_at: null })
      .eq('id', current.id);
    return { success: false, errorCode: rpcErrorCode(row?.error_code) ?? 'WALLET_NOT_FOUND' };
  }
  return {
    success: true,
    amountCredited: current.amountUsdt,
    newBalance: rpcMinor(row.new_balance),
  };
}

function throwWalletRpcError(code: string | undefined, fallback: string): never {
  const resolved = code ?? fallback;
  if (resolved === 'INSUFFICIENT_FUNDS' || resolved === 'INSUFFICIENT_AVAILABLE_FUNDS') {
    throw new WalletError(resolved, 'Available balance is insufficient');
  }
  if (resolved === 'WALLET_NOT_FOUND' || resolved === 'RESERVATION_NOT_FOUND') {
    throw new NotFoundError(resolved === 'WALLET_NOT_FOUND' ? 'Wallet' : 'Reservation');
  }
  throw new WalletError(resolved, resolved.replaceAll('_', ' ').toLowerCase());
}

/**
 * Called when an order is placed by a reseller.
 *
 * @param supabase - Service-role database client
 * @param walletId - Wallet UUID
 * @param orderId - Order UUID
 * @param amountMinor - Amount in USDT minor units
 * @param expiresAt - Reservation expiry
 */
export async function reserveFunds(
  supabase: DbClient,
  walletId: string,
  orderId: string,
  amountMinor: bigint,
  expiresAt: Date,
): Promise<void> {
  if (amountMinor <= 0n) {
    throw new ValidationError('INVALID_AMOUNT', 'Reservation amount must be greater than zero');
  }
  const { data, error } = await supabase.rpc('reserve_wallet_funds', {
    p_wallet_id: walletId,
    p_order_id: orderId,
    p_amount: amountMinor.toString(),
    p_expires_at: expiresAt.toISOString(),
  });
  if (error) {
    throw new AppError('RESERVE_FAILED', error.message, 500);
  }
  const row = firstRpcRow(data);
  if (row === null || !rpcBool(row.success)) {
    throwWalletRpcError(rpcErrorCode(row?.error_code), 'RESERVE_FAILED');
  }
}

/**
 * Called when an order is successfully fulfilled.
 *
 * @param supabase - Service-role database client
 * @param orderId - Order UUID
 */
export async function consumeReservation(supabase: DbClient, orderId: string): Promise<void> {
  const { data, error } = await supabase.rpc('consume_wallet_reservation', { p_order_id: orderId });
  if (error) {
    throw new AppError('CONSUME_FAILED', error.message, 500);
  }
  const row = firstRpcRow(data);
  if (row === null || !rpcBool(row.success)) {
    throwWalletRpcError(rpcErrorCode(row?.error_code), 'CONSUME_FAILED');
  }
}

/**
 * Called when an order fails or is cancelled.
 *
 * @param supabase - Service-role database client
 * @param orderId - Order UUID
 * @param reason - Release reason stored on the ledger
 */
export async function releaseReservation(supabase: DbClient, orderId: string, reason: string): Promise<void> {
  const { data, error } = await supabase.rpc('release_wallet_reservation', {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) {
    throw new AppError('RELEASE_FAILED', error.message, 500);
  }
  const row = firstRpcRow(data);
  if (row === null || !rpcBool(row.success)) {
    throwWalletRpcError(rpcErrorCode(row?.error_code), 'RELEASE_FAILED');
  }
}

/**
 * Owner only: manually add funds to a reseller wallet.
 *
 * @param supabase - Service-role database client
 * @param walletId - Wallet UUID
 * @param amountMinor - Amount in USDT minor units
 * @param actorId - Owner profile ID
 * @param note - Required adjustment note
 */
export async function manualCredit(
  supabase: DbClient,
  walletId: string,
  amountMinor: bigint,
  actorId: string,
  note: string,
): Promise<Wallet> {
  if (amountMinor <= 0n) {
    throw new ValidationError('INVALID_AMOUNT', 'Credit amount must be greater than zero');
  }
  const trimmedNote = note.trim();
  if (trimmedNote.length === 0) {
    throw new ValidationError('NOTE_REQUIRED', 'A note is required for manual adjustments');
  }

  const { data, error } = await supabase.rpc('manual_wallet_credit', {
    p_wallet_id: walletId,
    p_amount: amountMinor.toString(),
    p_actor_id: actorId,
    p_note: trimmedNote,
  });
  if (error) {
    throw new AppError('MANUAL_CREDIT_FAILED', error.message, 500);
  }
  const row = firstRpcRow(data);
  if (row === null || !rpcBool(row.success)) {
    throwWalletRpcError(rpcErrorCode(row?.error_code), 'MANUAL_CREDIT_FAILED');
  }

  const wallet = await getWalletById(supabase, walletId);
  await writeAuditLog(supabase, {
    actorId,
    action: 'wallet.manual_credit',
    targetType: 'wallet',
    targetId: walletId,
    tenantId: wallet.tenantId,
    afterVal: { amountUsdt: amountMinor.toString(), newBalance: wallet.balanceTotal.toString() },
    reason: trimmedNote,
  });
  return wallet;
}

/**
 * Owner only: manually remove funds from a reseller wallet.
 *
 * @param supabase - Service-role database client
 * @param walletId - Wallet UUID
 * @param amountMinor - Amount in USDT minor units
 * @param actorId - Owner profile ID
 * @param note - Required adjustment note
 */
export async function manualDebit(
  supabase: DbClient,
  walletId: string,
  amountMinor: bigint,
  actorId: string,
  note: string,
): Promise<Wallet> {
  if (amountMinor <= 0n) {
    throw new ValidationError('INVALID_AMOUNT', 'Debit amount must be greater than zero');
  }
  const trimmedNote = note.trim();
  if (trimmedNote.length === 0) {
    throw new ValidationError('NOTE_REQUIRED', 'A note is required for manual adjustments');
  }

  const { data, error } = await supabase.rpc('manual_wallet_debit', {
    p_wallet_id: walletId,
    p_amount: amountMinor.toString(),
    p_actor_id: actorId,
    p_note: trimmedNote,
  });
  if (error) {
    throw new AppError('MANUAL_DEBIT_FAILED', error.message, 500);
  }
  const row = firstRpcRow(data);
  if (row === null || !rpcBool(row.success)) {
    throwWalletRpcError(rpcErrorCode(row?.error_code), 'MANUAL_DEBIT_FAILED');
  }

  const wallet = await getWalletById(supabase, walletId);
  await writeAuditLog(supabase, {
    actorId,
    action: 'wallet.manual_debit',
    targetType: 'wallet',
    targetId: walletId,
    tenantId: wallet.tenantId,
    afterVal: { amountUsdt: amountMinor.toString(), newBalance: wallet.balanceTotal.toString() },
    reason: trimmedNote,
  });
  return wallet;
}

/**
 * Owner only: lists all reseller wallets with tenant name and balances.
 *
 * @param supabase - Service-role database client
 */
export async function listResellerWallets(supabase: DbClient): Promise<AdminWalletListItem[]> {
  const walletsResult = (await supabase
    .from('wallets')
    .select('id, tenant_id, balance_total, balance_reserved, updated_at')
    .order('balance_total', { ascending: false })) as QueryResult<unknown[] | null>;
  if (walletsResult.error) {
    throw new AppError('WALLET_LIST_FAILED', walletsResult.error.message, 500);
  }
  const walletRows = Array.isArray(walletsResult.data) ? walletsResult.data : [];
  if (walletRows.length === 0) {
    return [];
  }
  const wallets = walletRows.map((raw) => mapWalletRow(asWalletRow(raw)));
  const tenantIds = wallets.map((wallet) => wallet.tenantId);
  const tenantsResult = (await supabase
    .from('tenants')
    .select('id, display_name, status, owner_user_id')
    .in('id', tenantIds)) as QueryResult<unknown[] | null>;
  if (tenantsResult.error) {
    throw new AppError('TENANT_LOOKUP_FAILED', tenantsResult.error.message, 500);
  }
  const tenants = new Map<string, { display_name?: string; owner_user_id?: string }>();
  const ownerIds: string[] = [];
  for (const raw of Array.isArray(tenantsResult.data) ? tenantsResult.data : []) {
    const tenant = raw as { id: string; display_name?: string; owner_user_id?: string };
    tenants.set(tenant.id, tenant);
    if (tenant.owner_user_id) {
      ownerIds.push(tenant.owner_user_id);
    }
  }
  const profiles = new Map<string, string>();
  if (ownerIds.length > 0) {
    const profilesResult = (await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ownerIds)) as QueryResult<unknown[] | null>;
    for (const raw of Array.isArray(profilesResult.data) ? profilesResult.data : []) {
      const profile = raw as { id: string; display_name?: string };
      if (profile.display_name) {
        profiles.set(profile.id, profile.display_name);
      }
    }
  }
  return wallets.map((wallet) => {
    const tenant = tenants.get(wallet.tenantId);
    const resellerName =
      (tenant?.owner_user_id ? profiles.get(tenant.owner_user_id) : undefined) ??
      tenant?.display_name ??
      'Unknown reseller';
    return {
      walletId: wallet.id,
      tenantId: wallet.tenantId,
      tenantName: tenant?.display_name ?? 'Unknown tenant',
      resellerName,
      balanceTotal: wallet.balanceTotal,
      balanceReserved: wallet.balanceReserved,
      balanceAvailable: wallet.balanceAvailable,
      lastActivityAt: wallet.updatedAt,
    };
  });
}
