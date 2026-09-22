/**
 * @file lib/validations/platform-settings.ts
 *
 * Zod schemas for owner platform settings.
 *
 * @module Validations
 */

import { z } from 'zod';

const optionalText = (max: number) => z.string().max(max).nullable().optional();

export const UpdatePlatformInfoSchema = z.object({
  platformName: z.string().min(2).max(80).optional(),
  supportContact: optionalText(120),
  supportTelegram: optionalText(200),
});

export const ConnectOwnerBotSchema = z.object({
  botToken: z.string().min(10).max(200),
});

export const UpdatePlatformPaymentsSchema = z.object({
  platformUsdtWalletBep20: optionalText(80),
  binancePayApiKey: z.string().max(200).optional(),
  binancePayApiSecret: z.string().max(200).optional(),
  binancePayMerchantId: optionalText(80),
  binancePayEnabled: z.boolean().optional(),
  bep20Enabled: z.boolean().optional(),
});
