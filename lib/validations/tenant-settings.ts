/**
 * @file lib/validations/tenant-settings.ts
 *
 * Zod schemas for reseller tenant settings.
 *
 * @module Validations
 */

import { z } from 'zod';

const optionalText = (max: number) => z.string().max(max).nullable().optional();

export const UpdateTenantSettingsSchema = z.object({
  storeName: z.string().min(2).max(80).nullable().optional(),
  storeStatus: z.enum(['open', 'maintenance']).optional(),
  maintenanceMsg: optionalText(2000),
  supportContact: optionalText(120),
  supportChatUrl: optionalText(300),
  supportPhone: optionalText(40),
  supportMessage: optionalText(2000),
  termsOfService: optionalText(20000),
  refundPolicy: optionalText(20000),
  privacyPolicy: optionalText(20000),
  binanceMerchantUid: optionalText(80),
  binanceApiKey: z.string().min(8).max(200).optional(),
  binanceApiSecret: z.string().min(8).max(200).optional(),
  usdtWalletBep20: optionalText(80),
  usdtMinimumBep20: z.string().regex(/^\d+(\.\d{1,6})?$/).optional(),
  resellerSignupEnabled: z.boolean().optional(),
  resellerSignupMessage: optionalText(2000),
  markupPercent: z.number().min(0).max(999.99).optional(),
});

export const ApplyMarkupSchema = z.object({
  markupPercent: z.number().min(0).max(999.99),
});

export const DeliverOrderSchema = z.object({
  content: z.string().min(1).max(3500),
});

export const CustomerAdjustSchema = z.object({
  action: z.enum(['add', 'deduct', 'freeze', 'unfreeze']),
  amountUsdt: z.string().regex(/^\d+(\.\d{1,6})?$/).optional(),
  note: z.string().max(500).optional(),
});

export type UpdateTenantSettingsBody = z.infer<typeof UpdateTenantSettingsSchema>;
