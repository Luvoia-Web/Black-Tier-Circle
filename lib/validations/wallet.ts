/**
 * @file lib/validations/wallet.ts
 *
 * Zod schemas for wallet, token, and ledger APIs.
 * Money amounts arrive as human-readable USDT strings and are converted with bigint helpers.
 *
 * @module Validations
 */

import { usdtToMinor } from '@/lib/money';
import { isValidTokenFormat } from '@/lib/tokens';
import { z } from 'zod';

const TOKEN_STATUSES = ['active', 'redeemed', 'expired', 'revoked'] as const;

const usdtAmountString = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    try {
      return usdtToMinor(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid USDT amount' });
      return z.NEVER;
    }
  });

export const RedeemTokenSchema = z.object({
  token: z.string().refine(isValidTokenFormat, 'Token must be exactly 12 digits'),
});

export const CreateTopupTokenSchema = z.object({
  amountUsdtStr: usdtAmountString,
  tenantId: z.string().uuid().optional(),
  expiresAt: z.string().min(1).optional(),
});

export const ManualAdjustSchema = z.object({
  amountUsdtStr: usdtAmountString,
  note: z.string().min(1).max(500),
});

export const TokenStatusQuerySchema = z.enum(TOKEN_STATUSES);

export type RedeemTokenBody = z.infer<typeof RedeemTokenSchema>;
export type CreateTopupTokenBody = z.infer<typeof CreateTopupTokenSchema>;
export type ManualAdjustBody = z.infer<typeof ManualAdjustSchema>;
