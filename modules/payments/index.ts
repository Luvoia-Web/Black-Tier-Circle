/**
 * @file modules/payments/index.ts
 *
 * Payment processing module.
 * All payment verification goes through here — never call integration clients directly.
 *
 * DEMO MODE: sandbox adapters used automatically. All functions work identically.
 * LIVE MODE: real APIs called. Switch by setting env vars. Zero code changes.
 *
 * SECURITY INVARIANTS:
 * - Amount always verified against DB order (never client-supplied amount)
 * - TX hash uniqueness enforced (replay attack prevention)
 * - All claims written to payment_claims table for audit
 * - Verification evidence stored (redacted — no secrets)
 */

import { createBinancePayClientFromCredentials } from '@/integrations/binance/client';
import { createBscClient } from '@/integrations/bsc/client';
import { AppError, PaymentError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { amountSufficient, amountsMatch, minorToUsdtApiString, usdtToMinor } from '@/lib/money';
import { isBscScanConfigured, PAYMENT_CONFIG, payoutAddressFor } from '@/lib/payment-config';
import { resolveOrderPayments } from '@/modules/payments/resolve';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { TX_HASH_REGEX } from '@/lib/validations/payments';
import { getProduct } from '@/modules/catalog';
import {
  canTransitionFulfillment,
  claimTransition,
  getOrder,
  listOrders,
  recordTransition,
  type Order,
} from '@/modules/orders';
import { releaseReservation } from '@/modules/wallet';
import { mapPaymentClaimRow } from './map';
import type {
  CreateBinancePayOrderResult,
  PaymentClaim,
  PaymentClaimRow,
  PaymentStatusSnapshot,
  PaymentVerificationResult,
  SubmitBep20ClaimInput,
  SubmitBinancePayClaimInput,
} from './types';

export { resolveOrderPayments } from '@/modules/payments/resolve';
export type { ResolvedPayments } from '@/modules/payments/resolve';

export type {
  CreateBinancePayOrderResult,
  PaymentClaim,
  PaymentMethod,
  PaymentStatusSnapshot,
  PaymentVerificationResult,
  SubmitBep20ClaimInput,
  SubmitBinancePayClaimInput,
} from './types';

const PAYABLE_STATUSES = new Set(['awaiting', 'pending_verification']);

function asClaimRow(data: unknown): PaymentClaimRow {
  return data as PaymentClaimRow;
}

function maskRef(value: string): string {
  if (value.length <= 8) {
    return '********';
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function amountAccepted(expected: bigint, received: bigint): boolean {
  return PAYMENT_CONFIG.verification.allowOverpayment
    ? amountSufficient(expected, received)
    : amountsMatch(expected, received);
}

async function listClaimsForOrder(supabase: DbClient, orderId: string): Promise<PaymentClaim[]> {
  const result = (await supabase
    .from('payment_claims')
    .select('*')
    .eq('order_id', orderId)
    .order('submitted_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('CLAIM_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapPaymentClaimRow(asClaimRow(row)));
}

async function findClaimsByBinanceOrderId(
  supabase: DbClient,
  binanceOrderId: string,
): Promise<PaymentClaim[]> {
  const result = (await supabase
    .from('payment_claims')
    .select('*')
    .eq('binance_order_id', binanceOrderId)) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('CLAIM_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapPaymentClaimRow(asClaimRow(row)));
}

async function findClaimsByTxHash(supabase: DbClient, txHash: string): Promise<PaymentClaim[]> {
  const result = (await supabase
    .from('payment_claims')
    .select('*')
    .eq('tx_hash', txHash)) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('CLAIM_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapPaymentClaimRow(asClaimRow(row)));
}

async function insertClaim(
  supabase: DbClient,
  values: {
    readonly orderId: string;
    readonly paymentMethod: 'binance_pay' | 'usdt_bep20';
    readonly binanceOrderId?: string;
    readonly txHash?: string;
  },
): Promise<PaymentClaim> {
  const { data, error } = await supabase
    .from('payment_claims')
    .insert({
      order_id: values.orderId,
      payment_method: values.paymentMethod,
      binance_order_id: values.binanceOrderId ?? null,
      tx_hash: values.txHash ?? null,
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('CLAIM_CREATE_FAILED', error?.message ?? 'Unable to store payment claim', 500);
  }
  return mapPaymentClaimRow(asClaimRow(data));
}

async function finalizeClaim(
  supabase: DbClient,
  claimId: string,
  outcome: { readonly verified: true } | { readonly verified: false; readonly rejectReason: string },
  evidence: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  const patch =
    outcome.verified === true
      ? { verified_at: now, verification_evidence: evidence }
      : {
          rejected_at: now,
          reject_reason: outcome.rejectReason,
          verification_evidence: evidence,
        };
  const { error } = await supabase.from('payment_claims').update(patch).eq('id', claimId);
  if (error) {
    throw new AppError('CLAIM_UPDATE_FAILED', error.message, 500);
  }
}

async function markPendingIfNeeded(supabase: DbClient, order: Order): Promise<Order> {
  if (order.paymentStatus === 'awaiting') {
    const won = await claimTransition(supabase, order.id, 'payment', 'awaiting', 'pending_verification', {
      trigger: 'api',
      note: 'payment claim submitted',
    });
    if (!won) {
      return getOrder(supabase, order.id);
    }
    return getOrder(supabase, order.id);
  }
  return order;
}

async function succeedPayment(supabase: DbClient, order: Order, note: string): Promise<void> {
  if (order.paymentStatus !== 'verified') {
    const won = await claimTransition(supabase, order.id, 'payment', order.paymentStatus, 'verified', {
      trigger: 'api',
      note,
    });
    if (!won) {
      const latest = await getOrder(supabase, order.id);
      if (latest.paymentStatus !== 'verified') {
        throw new PaymentError('PAYMENT_IN_PROGRESS', 'This payment is already being processed');
      }
    }
  }
  const latest = await getOrder(supabase, order.id);
  if (
    latest.fulfillmentStatus !== 'queued' &&
    canTransitionFulfillment(latest.fulfillmentStatus, 'queued')
  ) {
    await recordTransition(supabase, latest.id, 'fulfillment', latest.fulfillmentStatus, 'queued', {
      trigger: 'api',
      note: 'queued after payment verification',
    });
  }
}

async function failPayment(supabase: DbClient, order: Order, reason: string): Promise<void> {
  if (order.paymentStatus !== 'failed' && order.paymentStatus !== 'verified') {
    await recordTransition(supabase, order.id, 'payment', order.paymentStatus, 'failed', {
      trigger: 'api',
      note: reason,
    });
  }
  const latest = await getOrder(supabase, order.id);
  if (latest.fundingStatus === 'reserved') {
    await releaseReservation(supabase, latest.id, reason);
    await recordTransition(supabase, latest.id, 'funding', 'reserved', 'released', {
      trigger: 'api',
      note: reason,
    });
  }
}

function enqueueOrderWebhook(
  supabase: DbClient,
  tenantId: string | null,
  event: 'order.payment_verified' | 'order.failed',
  data: Record<string, unknown>,
): void {
  void import('@/modules/public-api/webhooks')
    .then(({ enqueueWebhook }) => {
      enqueueWebhook(supabase, tenantId, event, data);
    })
    .catch((error: unknown) => {
      logger.error('webhook enqueue failed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
    });
}

function triggerFulfillment(supabase: DbClient, orderId: string): void {
  void import('@/modules/fulfillment')
    .then(({ processQueuedOrder }) => processQueuedOrder(supabase, orderId))
    .catch((error: unknown) => {
      logger.error('fulfillment trigger failed', {
        orderId,
        message: error instanceof Error ? error.message : 'unknown',
      });
    });
}

async function writeAuditLog(
  supabase: DbClient,
  entry: {
    readonly actorId: string;
    readonly action: string;
    readonly targetId: string;
    readonly reason: string;
    readonly afterVal?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_type: 'order',
    target_id: entry.targetId,
    after_val: entry.afterVal ?? null,
    reason: entry.reason,
  });
  if (error) {
    throw new AppError('AUDIT_WRITE_FAILED', error.message, 500);
  }
}

function successResult(status: string): PaymentVerificationResult {
  return { verified: true, newPaymentStatus: status };
}

function failureResult(reason: string, status: string): PaymentVerificationResult {
  return { verified: false, rejectReason: reason, newPaymentStatus: status };
}

/**
 * Creates a Binance Pay checkout session for an existing order.
 * Amount always comes from the database quote — never from the client.
 *
 * @param supabase - Database client
 * @param orderId - Order UUID
 */
export async function createBinancePayOrder(
  supabase: DbClient,
  orderId: string,
): Promise<CreateBinancePayOrderResult> {
  const order = await getOrder(supabase, orderId);
  if (!PAYABLE_STATUSES.has(order.paymentStatus)) {
    throw new PaymentError('ORDER_NOT_PAYABLE', 'This order is not awaiting payment');
  }
  const product = await getProduct(supabase, order.productId);
  const resolved = await resolveOrderPayments(supabase, order.tenantId);
  const merchantTradeNo = order.id.replaceAll('-', '');
  const checkout = await createBinancePayClientFromCredentials(resolved.binance).createOrder({
    merchantTradeNo,
    orderAmount: minorToUsdtApiString(order.quotedRetailPriceMinor),
    currency: 'USDT',
    goods: { goodsName: product.title },
  });
  const { error } = await supabase
    .from('orders')
    .update({
      payment_method: 'binance_pay',
      external_order_ref: checkout.prepayId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);
  if (error) {
    throw new AppError('ORDER_UPDATE_FAILED', error.message, 500);
  }
  return {
    prepayId: checkout.prepayId,
    checkoutUrl: checkout.checkoutUrl,
    isDemoMode: resolved.binance === null,
  };
}

/**
 * Verifies a Binance Pay claim against the live or sandbox adapter.
 *
 * @param supabase - Database client
 * @param input - Order id plus customer-submitted Binance order id
 */
export async function verifyBinancePayClaim(
  supabase: DbClient,
  input: SubmitBinancePayClaimInput,
): Promise<PaymentVerificationResult> {
  const order = await getOrder(supabase, input.orderId);
  const existing = await listClaimsForOrder(supabase, order.id);
  const verifiedClaim = existing.find((claim) => claim.verifiedAt !== null);
  if (verifiedClaim || order.paymentStatus === 'verified') {
    return successResult('verified');
  }
  if (!PAYABLE_STATUSES.has(order.paymentStatus)) {
    throw new PaymentError('ORDER_NOT_PAYABLE', 'This order is not awaiting payment verification');
  }

  const replay = await findClaimsByBinanceOrderId(supabase, input.binanceOrderId);
  if (replay.some((claim) => claim.orderId !== order.id && claim.verifiedAt !== null)) {
    return failureResult('BINANCE_ORDER_REPLAY', order.paymentStatus);
  }

  const pending = await markPendingIfNeeded(supabase, order);
  await supabase
    .from('orders')
    .update({ payment_method: 'binance_pay', updated_at: new Date().toISOString() })
    .eq('id', pending.id);

  const claim = await insertClaim(supabase, {
    orderId: pending.id,
    paymentMethod: 'binance_pay',
    binanceOrderId: input.binanceOrderId,
  });

  const resolved = await resolveOrderPayments(supabase, order.tenantId);
  const query = await createBinancePayClientFromCredentials(resolved.binance).queryOrder(input.binanceOrderId);
  const evidence = {
    status: query.status,
    paidCurrency: query.paidCurrency ?? null,
    reference: maskRef(input.binanceOrderId),
  };

  if (query.status !== 'PAID') {
    await finalizeClaim(supabase, claim.id, { verified: false, rejectReason: 'BINANCE_NOT_PAID' }, evidence);
    await failPayment(supabase, pending, 'BINANCE_NOT_PAID');
    return failureResult('BINANCE_NOT_PAID', 'failed');
  }

  let paidMinor: bigint;
  try {
    paidMinor = usdtToMinor(query.paidAmount ?? '0');
  } catch {
    await finalizeClaim(supabase, claim.id, { verified: false, rejectReason: 'AMOUNT_MISMATCH' }, evidence);
    await failPayment(supabase, pending, 'AMOUNT_MISMATCH');
    return failureResult('AMOUNT_MISMATCH', 'failed');
  }

  if (!amountAccepted(pending.quotedRetailPriceMinor, paidMinor)) {
    await finalizeClaim(supabase, claim.id, { verified: false, rejectReason: 'AMOUNT_MISMATCH' }, evidence);
    await failPayment(supabase, pending, 'AMOUNT_MISMATCH');
    return failureResult('AMOUNT_MISMATCH', 'failed');
  }

  await finalizeClaim(supabase, claim.id, { verified: true }, evidence);
  await succeedPayment(supabase, pending, 'binance pay verified');
  enqueueOrderWebhook(supabase, pending.tenantId, 'order.payment_verified', { orderId: pending.id });
  triggerFulfillment(supabase, pending.id);
  return successResult('verified');
}

/**
 * Verifies a BEP20 USDT transfer claim.
 *
 * @param supabase - Database client
 * @param input - Order id plus customer-submitted transaction hash
 */
export async function verifyBep20Claim(
  supabase: DbClient,
  input: SubmitBep20ClaimInput,
): Promise<PaymentVerificationResult> {
  const txHash = input.txHash.trim();
  const orderForMode = await getOrder(supabase, input.orderId);
  const resolved = await resolveOrderPayments(supabase, orderForMode.tenantId);
  const isDemoFail = resolved.bep20Address === null && txHash.startsWith(PAYMENT_CONFIG.demo.failTxPrefix);
  if (!TX_HASH_REGEX.test(txHash) && !isDemoFail) {
    throw new ValidationError('INVALID_TX_HASH', 'Invalid transaction hash format');
  }

  const order = orderForMode;
  const existing = await listClaimsForOrder(supabase, order.id);
  if (existing.some((claim) => claim.verifiedAt !== null) || order.paymentStatus === 'verified') {
    return successResult('verified');
  }
  if (!PAYABLE_STATUSES.has(order.paymentStatus)) {
    throw new PaymentError('ORDER_NOT_PAYABLE', 'This order is not awaiting payment verification');
  }

  const replay = await findClaimsByTxHash(supabase, txHash);
  if (replay.length > 0) {
    const pending = await markPendingIfNeeded(supabase, order);
    const claim = await insertClaim(supabase, {
      orderId: pending.id,
      paymentMethod: 'usdt_bep20',
      txHash,
    });
    await finalizeClaim(
      supabase,
      claim.id,
      { verified: false, rejectReason: 'TX_REPLAY' },
      { reference: maskRef(txHash) },
    );
    await failPayment(supabase, pending, 'TX_REPLAY');
    return failureResult('TX_REPLAY', 'failed');
  }

  const pending = await markPendingIfNeeded(supabase, order);
  await supabase
    .from('orders')
    .update({ payment_method: 'usdt_bep20', updated_at: new Date().toISOString() })
    .eq('id', pending.id);

  const claim = await insertClaim(supabase, {
    orderId: pending.id,
    paymentMethod: 'usdt_bep20',
    txHash,
  });

  const result = await createBscClient({
    live: resolved.bep20Address !== null && isBscScanConfigured(),
  }).verifyUsdtTransfer({
    txHash,
    expectedToAddress: payoutAddressFor(resolved.bep20Address),
    expectedAmountMinor: pending.quotedRetailPriceMinor,
    windowSeconds: PAYMENT_CONFIG.bep20.txWindowSeconds,
    orderCreatedAt: pending.createdAt,
  });

  const evidence = {
    verified: result.verified,
    rejectReason: result.rejectReason ?? null,
    reference: maskRef(txHash),
  };

  if (!result.verified) {
    const reason = result.rejectReason ?? 'BSC_NOT_VERIFIED';
    await finalizeClaim(supabase, claim.id, { verified: false, rejectReason: reason }, evidence);
    await failPayment(supabase, pending, reason);
    return failureResult(reason, 'failed');
  }

  const received = result.amountMinor ?? 0n;
  if (!amountAccepted(pending.quotedRetailPriceMinor, received)) {
    await finalizeClaim(supabase, claim.id, { verified: false, rejectReason: 'AMOUNT_MISMATCH' }, evidence);
    await failPayment(supabase, pending, 'AMOUNT_MISMATCH');
    return failureResult('AMOUNT_MISMATCH', 'failed');
  }

  await finalizeClaim(supabase, claim.id, { verified: true }, evidence);
  await succeedPayment(supabase, pending, 'bep20 transfer verified');
  enqueueOrderWebhook(supabase, pending.tenantId, 'order.payment_verified', { orderId: pending.id });
  triggerFulfillment(supabase, pending.id);
  return successResult('verified');
}

/**
 * Returns current order payment state plus the latest claim.
 *
 * @param supabase - Database client
 * @param orderId - Order UUID
 */
export async function getPaymentStatus(
  supabase: DbClient,
  orderId: string,
): Promise<PaymentStatusSnapshot> {
  const order = await getOrder(supabase, orderId);
  const claims = await listClaimsForOrder(supabase, orderId);
  return {
    orderId: order.id,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    claim: claims[0] ?? null,
  };
}

/**
 * Owner use: orders with payment_status = pending_verification.
 *
 * @param supabase - Database client
 */
export async function getPendingVerifications(supabase: DbClient): Promise<Order[]> {
  return listOrders(supabase, { paymentStatus: 'pending_verification', limit: 100 });
}

/**
 * Lists orders for the owner payment monitor.
 *
 * @param supabase - Database client
 * @param tab - pending | verified | failed | all
 */
export async function listPaymentMonitorOrders(
  supabase: DbClient,
  tab: 'pending' | 'verified' | 'failed' | 'all',
): Promise<Order[]> {
  if (tab === 'pending') {
    return listOrders(supabase, { paymentStatus: 'pending_verification', limit: 100 });
  }
  if (tab === 'verified') {
    return listOrders(supabase, { paymentStatus: 'verified', limit: 100 });
  }
  if (tab === 'failed') {
    return listOrders(supabase, { paymentStatus: 'failed', limit: 100 });
  }
  return listOrders(supabase, { limit: 100 });
}

/**
 * Owner only: force verify or force fail a payment.
 *
 * @param supabase - Database client
 * @param orderId - Order UUID
 * @param action - verify or fail
 * @param actorId - Owner profile id
 * @param reason - Required explanation (min 10 chars, validated by caller)
 */
export async function manualOverridePayment(
  supabase: DbClient,
  orderId: string,
  action: 'verify' | 'fail',
  actorId: string,
  reason: string,
): Promise<void> {
  if (reason.trim().length < 10) {
    throw new ValidationError('OVERRIDE_REASON_REQUIRED', 'Please provide a reason of at least 10 characters');
  }
  const order = await getOrder(supabase, orderId);
  if (order.paymentStatus !== 'pending_verification' && order.paymentStatus !== 'failed') {
    throw new PaymentError('OVERRIDE_NOT_ALLOWED', 'Only pending or failed payments can be overridden');
  }

  if (action === 'verify') {
    await succeedPayment(supabase, order, `manual override: ${reason}`);
    enqueueOrderWebhook(supabase, order.tenantId, 'order.payment_verified', { orderId: order.id });
    triggerFulfillment(supabase, order.id);
  } else if (order.paymentStatus !== 'failed') {
    await failPayment(supabase, order, `manual override: ${reason}`);
  }

  const latest = await getOrder(supabase, orderId);
  await writeAuditLog(supabase, {
    actorId,
    action: action === 'verify' ? 'payment.override.verify' : 'payment.override.fail',
    targetId: orderId,
    reason,
    afterVal: {
      paymentStatus: latest.paymentStatus,
      fulfillmentStatus: latest.fulfillmentStatus,
      fundingStatus: latest.fundingStatus,
    },
  });
}

function rpcBool(value: unknown): boolean {
  return value === true;
}

function rpcMinor(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return BigInt(value);
  }
  return 0n;
}

function firstCreditRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const row = data[0];
    return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
  }
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>;
  }
  return null;
}

async function markPaymentMethod(
  supabase: DbClient,
  orderId: string,
  method: 'wallet' | 'demo' | 'binance_pay' | 'usdt_bep20',
): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ payment_method: method, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (error) {
    throw new AppError('ORDER_UPDATE_FAILED', error.message, 500);
  }
}

async function beginPayment(supabase: DbClient, order: Order, note: string): Promise<Order> {
  if (order.paymentStatus === 'awaiting') {
    await claimTransition(supabase, order.id, 'payment', 'awaiting', 'pending_verification', {
      trigger: 'api',
      note,
    });
    return getOrder(supabase, order.id);
  }
  return order;
}

type CreditEntry = {
  readonly order_id?: string;
  readonly entry_type?: string;
  readonly amount_minor?: string | number;
};

function entryRows(data: unknown): CreditEntry[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter((row): row is CreditEntry => Boolean(row) && typeof row === 'object');
}

function rpcMissing(message: string): boolean {
  return /unknown rpc|does not exist|could not find the function|schema cache/i.test(message);
}

function ledgerMissing(message: string): boolean {
  return /customer_credit_entries|does not exist|schema cache|relation/i.test(message);
}

async function listCreditEntries(supabase: DbClient, orderId: string): Promise<CreditEntry[] | null> {
  const result = (await supabase.from('customer_credit_entries').select('*').eq('order_id', orderId)) as QueryResult<
    unknown[] | null
  >;
  if (result.error) {
    if (ledgerMissing(result.error.message)) {
      return null;
    }
    throw new AppError('WALLET_LEDGER_FAILED', result.error.message, 500);
  }
  return entryRows(result.data);
}

async function insertCreditEntry(
  supabase: DbClient,
  entry: { readonly customerId: string; readonly orderId: string; readonly entryType: 'debit' | 'refund'; readonly amount: bigint },
): Promise<'inserted' | 'duplicate' | 'unavailable'> {
  const result = (await supabase
    .from('customer_credit_entries')
    .insert({
      customer_id: entry.customerId,
      order_id: entry.orderId,
      entry_type: entry.entryType,
      amount_minor: entry.amount.toString(),
    })
    .select('id')) as QueryResult<unknown>;
  if (result.error) {
    if (result.error.code === '23505' || /duplicate key/i.test(result.error.message)) {
      return 'duplicate';
    }
    if (ledgerMissing(result.error.message)) {
      return 'unavailable';
    }
    throw new AppError('WALLET_LEDGER_FAILED', result.error.message, 500);
  }
  return 'inserted';
}

/**
 * Returns the wallet debit exactly once. A second call finds the refund row and does nothing.
 */
export async function refundWalletPaymentOnce(
  supabase: DbClient,
  orderId: string,
  customerId: string,
): Promise<'refunded' | 'none'> {
  const order = await getOrder(supabase, orderId);
  if (order.customerId !== customerId) {
    return 'none';
  }
  if (order.deliveryStatus === 'sent' || order.fulfillmentStatus === 'ready') {
    return 'none';
  }
  const entries = await listCreditEntries(supabase, orderId);
  if (entries === null) {
    return 'none';
  }
  const debit = entries.find((row) => row.entry_type === 'debit');
  if (!debit) {
    return 'none';
  }
  if (entries.some((row) => row.entry_type === 'refund')) {
    return 'refunded';
  }
  const amount = rpcMinor(debit.amount_minor);
  const inserted = await insertCreditEntry(supabase, {
    customerId,
    orderId,
    entryType: 'refund',
    amount,
  });
  if (inserted === 'duplicate') {
    return 'refunded';
  }
  if (inserted === 'unavailable') {
    return 'none';
  }
  const credited = await supabase.rpc('adjust_customer_credit', {
    p_customer_id: customerId,
    p_delta: amount.toString(),
  });
  const row = credited.error ? null : firstCreditRow(credited.data);
  if (credited.error || row === null || !rpcBool(row.success)) {
    await supabase.from('customer_credit_entries').delete().eq('order_id', orderId).eq('entry_type', 'refund');
    throw new AppError('WALLET_REFUND_FAILED', credited.error?.message ?? 'Refund failed', 500);
  }
  const latest = await getOrder(supabase, orderId);
  if (latest.paymentStatus === 'verified') {
    const pending = await claimTransition(supabase, orderId, 'payment', 'verified', 'refund_pending', {
      trigger: 'api',
      note: 'wallet refund',
    });
    if (pending) {
      await claimTransition(supabase, orderId, 'payment', 'refund_pending', 'refunded', {
        trigger: 'api',
        note: 'wallet refund completed',
      });
    }
  } else if (latest.paymentStatus === 'pending_verification') {
    const failed = await claimTransition(supabase, orderId, 'payment', 'pending_verification', 'failed', {
      trigger: 'api',
      note: 'wallet payment rolled back',
    });
    if (failed) {
      await claimTransition(supabase, orderId, 'payment', 'failed', 'awaiting', {
        trigger: 'api',
        note: 'payable again after refund',
      });
    }
  }
  if (canTransitionFulfillment(latest.fulfillmentStatus, 'canceled') && latest.fulfillmentStatus !== 'canceled') {
    await claimTransition(supabase, orderId, 'fulfillment', latest.fulfillmentStatus, 'canceled', {
      trigger: 'api',
      note: 'cancelled after wallet refund',
    });
  }
  const { releaseCheckoutKey } = await import('@/modules/orders/checkout');
  await releaseCheckoutKey(supabase, orderId);
  return 'refunded';
}

async function payOrderInApplication(
  supabase: DbClient,
  order: Order,
  customerId: string,
): Promise<{ readonly newBalance: bigint; readonly amount: bigint }> {
  const price = order.quotedRetailPriceMinor;
  const won = await claimTransition(supabase, order.id, 'payment', 'awaiting', 'pending_verification', {
    trigger: 'api',
    note: 'wallet payment started',
  });
  if (!won) {
    const latest = await getOrder(supabase, order.id);
    if (latest.paymentStatus === 'verified') {
      throw new PaymentError('ORDER_ALREADY_PAID', 'This order has already been paid');
    }
    throw new PaymentError('PAYMENT_IN_PROGRESS', 'Already processing your order. Please wait a few seconds.');
  }
  await markPaymentMethod(supabase, order.id, 'wallet');
  const ledger = await insertCreditEntry(supabase, {
    customerId,
    orderId: order.id,
    entryType: 'debit',
    amount: price,
  });
  if (ledger === 'duplicate') {
    throw new PaymentError('PAYMENT_IN_PROGRESS', 'Already processing your order. Please wait a few seconds.');
  }
  const credited = await supabase.rpc('adjust_customer_credit', {
    p_customer_id: customerId,
    p_delta: (-price).toString(),
  });
  const row = credited.error ? null : firstCreditRow(credited.data);
  if (credited.error || row === null || !rpcBool(row.success)) {
    if (ledger === 'inserted') {
      await supabase.from('customer_credit_entries').delete().eq('order_id', order.id).eq('entry_type', 'debit');
    }
    await claimTransition(supabase, order.id, 'payment', 'pending_verification', 'failed', {
      trigger: 'api',
      note: 'wallet debit failed',
    });
    await claimTransition(supabase, order.id, 'payment', 'failed', 'awaiting', {
      trigger: 'api',
      note: 'restored so the customer can retry',
    });
    if (credited.error) {
      throw new AppError('WALLET_DEBIT_FAILED', credited.error.message, 500);
    }
    throw new PaymentError('INSUFFICIENT_BALANCE', 'Customer balance is too low');
  }
  try {
    const verified = await claimTransition(supabase, order.id, 'payment', 'pending_verification', 'verified', {
      trigger: 'api',
      note: 'paid from customer wallet',
    });
    if (!verified) {
      const latest = await getOrder(supabase, order.id);
      if (latest.paymentStatus !== 'verified') {
        throw new PaymentError('PAYMENT_IN_PROGRESS', 'Already processing your order. Please wait a few seconds.');
      }
    }
  } catch (error: unknown) {
    await refundWalletPaymentOnce(supabase, order.id, customerId);
    throw error;
  }
  const { releaseCheckoutKey } = await import('@/modules/orders/checkout');
  await releaseCheckoutKey(supabase, order.id);
  enqueueOrderWebhook(supabase, order.tenantId, 'order.payment_verified', { orderId: order.id });
  return { newBalance: rpcMinor(row.new_balance), amount: price };
}

/**
 * Pays an awaiting order from the customer's credit balance.
 * The debit is reversed if the order cannot be marked verified.
 */
function walletRpcRow(data: unknown): Record<string, unknown> | null {
  return firstCreditRow(data);
}

export async function payOrderFromCustomerWallet(
  supabase: DbClient,
  orderId: string,
  customerId: string,
): Promise<{ readonly newBalance: bigint; readonly amount: bigint }> {
  const order = await getOrder(supabase, orderId);
  if (order.customerId !== customerId) {
    throw new PaymentError('ORDER_NOT_FOUND', 'Order not found');
  }
  if (order.paymentStatus === 'verified') {
    throw new PaymentError('ORDER_ALREADY_PAID', 'This order has already been paid');
  }
  if (order.paymentStatus === 'pending_verification') {
    throw new PaymentError('PAYMENT_IN_PROGRESS', 'Already processing your order. Please wait a few seconds.');
  }
  if (order.paymentStatus !== 'awaiting') {
    throw new PaymentError('ORDER_NOT_PAYABLE', 'This order is not waiting for payment');
  }

  const rpc = await supabase.rpc('pay_order_from_customer_wallet', {
    p_order_id: orderId,
    p_customer_id: customerId,
  });
  if (rpc.error && rpcMissing(rpc.error.message)) {
    return payOrderInApplication(supabase, order, customerId);
  }
  const row = rpc.error ? null : walletRpcRow(rpc.data);
  if (rpc.error || row === null) {
    throw new AppError('WALLET_DEBIT_FAILED', rpc.error?.message ?? 'Wallet payment failed', 500);
  }
  if (!rpcBool(row.success)) {
    const code = typeof row.error_code === 'string' ? row.error_code : 'WALLET_DEBIT_FAILED';
    if (code === 'PAYMENT_IN_PROGRESS') {
      throw new PaymentError('PAYMENT_IN_PROGRESS', 'Already processing your order. Please wait a few seconds.');
    }
    if (code === 'ORDER_ALREADY_PAID') {
      throw new PaymentError('ORDER_ALREADY_PAID', 'This order has already been paid');
    }
    if (code === 'INSUFFICIENT_BALANCE' || code === 'INSUFFICIENT_CREDIT_OR_NOT_FOUND') {
      throw new PaymentError('INSUFFICIENT_BALANCE', 'Customer balance is too low');
    }
    if (code === 'ORDER_EXPIRED') {
      throw new PaymentError('ORDER_EXPIRED', 'This order expired. Please start again.');
    }
    throw new PaymentError(code, 'This order is not waiting for payment');
  }
  enqueueOrderWebhook(supabase, order.tenantId, 'order.payment_verified', { orderId: order.id });
  return { newBalance: rpcMinor(row.new_balance), amount: rpcMinor(row.amount) };
}

/**
 * Marks an order paid in demo mode without calling Binance or BscScan.
 */
export async function confirmDemoOrderPayment(supabase: DbClient, orderId: string): Promise<Order> {
  const order = await getOrder(supabase, orderId);
  const resolved = await resolveOrderPayments(supabase, order.tenantId);
  if (!resolved.demo) {
    throw new PaymentError('DEMO_DISABLED', 'Demo payment is off because a live method is configured');
  }
  if (order.paymentStatus === 'verified') {
    return order;
  }
  if (order.paymentStatus !== 'awaiting' && order.paymentStatus !== 'pending_verification') {
    throw new PaymentError('ORDER_NOT_PAYABLE', 'This order is not waiting for payment');
  }
  const pending = await beginPayment(supabase, order, 'demo payment started');
  await markPaymentMethod(supabase, pending.id, 'demo');
  await succeedPayment(supabase, pending, 'demo mode payment simulated');
  enqueueOrderWebhook(supabase, pending.tenantId, 'order.payment_verified', { orderId: pending.id });
  triggerFulfillment(supabase, pending.id);
  return getOrder(supabase, order.id);
}

/**
 * Resolves a Binance merchantTradeNo to an order id when possible.
 *
 * @param compactOrUuid - merchantTradeNo (compact uuid) or order uuid
 */
export function orderIdFromMerchantTradeNo(compactOrUuid: string): string | null {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(compactOrUuid)) {
    return compactOrUuid;
  }
  if (/^[0-9a-f]{32}$/i.test(compactOrUuid)) {
    return `${compactOrUuid.slice(0, 8)}-${compactOrUuid.slice(8, 12)}-${compactOrUuid.slice(12, 16)}-${compactOrUuid.slice(16, 20)}-${compactOrUuid.slice(20)}`;
  }
  return null;
}
