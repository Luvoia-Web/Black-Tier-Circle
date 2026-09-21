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

import { createBinancePayClient } from '@/integrations/binance/client';
import { createBscClient } from '@/integrations/bsc/client';
import { AppError, PaymentError, ValidationError } from '@/lib/errors';
import { amountSufficient, amountsMatch, minorToUsdtApiString, usdtToMinor } from '@/lib/money';
import { getBep20PayoutAddress, PAYMENT_CONFIG } from '@/lib/payment-config';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { TX_HASH_REGEX } from '@/lib/validations/payments';
import { getProduct } from '@/modules/catalog';
import {
  canTransitionFulfillment,
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

function isDemoMode(): boolean {
  return PAYMENT_CONFIG.mode === 'demo';
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
    await recordTransition(supabase, order.id, 'payment', 'awaiting', 'pending_verification', {
      trigger: 'api',
      note: 'payment claim submitted',
    });
    return getOrder(supabase, order.id);
  }
  return order;
}

async function succeedPayment(supabase: DbClient, order: Order, note: string): Promise<void> {
  if (order.paymentStatus !== 'verified') {
    await recordTransition(supabase, order.id, 'payment', order.paymentStatus, 'verified', {
      trigger: 'api',
      note,
    });
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
  const merchantTradeNo = order.id.replaceAll('-', '');
  const checkout = await createBinancePayClient().createOrder({
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
    isDemoMode: isDemoMode(),
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

  const query = await createBinancePayClient().queryOrder(input.binanceOrderId);
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
  const isDemoFail = isDemoMode() && txHash.startsWith(PAYMENT_CONFIG.demo.failTxPrefix);
  if (!TX_HASH_REGEX.test(txHash) && !isDemoFail) {
    throw new ValidationError('INVALID_TX_HASH', 'Invalid transaction hash format');
  }

  const order = await getOrder(supabase, input.orderId);
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

  const result = await createBscClient().verifyUsdtTransfer({
    txHash,
    expectedToAddress: getBep20PayoutAddress(),
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
