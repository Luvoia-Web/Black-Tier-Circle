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
  readonly submittedAt: string;
};
