/**
 * @file modules/payments/map.ts
 *
 * Maps payment_claims rows to domain types.
 *
 * @module Payments
 */

import type { PaymentClaim, PaymentClaimRow, PaymentMethod } from './types';

function asMethod(value: string): PaymentMethod {
  return value === 'usdt_bep20' ? 'usdt_bep20' : 'binance_pay';
}

/**
 * Maps a payment_claims table row.
 *
 * @param row - Database row
 */
export function mapPaymentClaimRow(row: PaymentClaimRow): PaymentClaim {
  return {
    id: row.id,
    orderId: row.order_id,
    paymentMethod: asMethod(row.payment_method),
    binanceOrderId: row.binance_order_id,
    txHash: row.tx_hash,
    submittedAt: new Date(row.submitted_at),
    verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
    rejectedAt: row.rejected_at ? new Date(row.rejected_at) : null,
    rejectReason: row.reject_reason,
  };
}
