/**
 * @file modules/payments/types.ts
 *
 * Payment claim types for Binance Pay and USDT BEP20.
 *
 * @module Payments
 */

export type PaymentMethod = 'binance_pay' | 'usdt_bep20';

export type PaymentClaim = {
  readonly id: string;
  readonly orderId: string;
  readonly paymentMethod: PaymentMethod;
  readonly binanceOrderId: string | null;
  readonly txHash: string | null;
  readonly submittedAt: Date;
  readonly verifiedAt: Date | null;
  readonly rejectedAt: Date | null;
  readonly rejectReason: string | null;
};

export type PaymentClaimRow = {
  readonly id: string;
  readonly order_id: string;
  readonly payment_method: string;
  readonly binance_order_id: string | null;
  readonly tx_hash: string | null;
  readonly submitted_at: string;
  readonly verified_at: string | null;
  readonly rejected_at: string | null;
  readonly reject_reason: string | null;
  readonly verification_evidence: unknown;
};

export type SubmitBinancePayClaimInput = {
  readonly orderId: string;
  readonly binanceOrderId: string;
};

export type SubmitBep20ClaimInput = {
  readonly orderId: string;
  readonly txHash: string;
};

export type PaymentVerificationResult = {
  readonly verified: boolean;
  readonly rejectReason?: string;
  readonly newPaymentStatus?: string;
};

export type CreateBinancePayOrderResult = {
  readonly prepayId: string;
  readonly checkoutUrl: string;
  /** Demo mode: shows sandbox notice */
  readonly isDemoMode: boolean;
};

export type PaymentStatusSnapshot = {
  readonly orderId: string;
  readonly paymentStatus: string;
  readonly paymentMethod: PaymentMethod | null;
  readonly claim: PaymentClaim | null;
};
