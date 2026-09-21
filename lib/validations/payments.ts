/**
 * @file lib/validations/payments.ts
 *
 * Zod schemas for payment claim, override, and Binance order APIs.
 *
 * @module Validations
 */

import { z } from 'zod';

export const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;
export const BINANCE_NUMERIC_ORDER_ID_REGEX = /^[0-9]{10,20}$/;

export const BinancePayClaimSchema = z.object({
  orderId: z.string().uuid(),
  binanceOrderId: z.string().min(5).max(50),
});

export const Bep20ClaimSchema = z.object({
  orderId: z.string().uuid(),
  txHash: z.string().regex(TX_HASH_REGEX, 'Invalid transaction hash format'),
});

export const PaymentOverrideSchema = z.object({
  action: z.enum(['verify', 'fail']),
  reason: z.string().min(10, 'Please provide a reason of at least 10 characters'),
});

export const CreateBinanceOrderSchema = z.object({
  orderId: z.string().uuid(),
});

export type BinancePayClaimBody = z.infer<typeof BinancePayClaimSchema>;
export type Bep20ClaimBody = z.infer<typeof Bep20ClaimSchema>;
export type PaymentOverrideBody = z.infer<typeof PaymentOverrideSchema>;
export type CreateBinanceOrderBody = z.infer<typeof CreateBinanceOrderSchema>;
