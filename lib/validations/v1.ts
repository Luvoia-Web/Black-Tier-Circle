/**
 * @file lib/validations/v1.ts
 *
 * Zod schemas for public /api/v1/ request bodies.
 *
 * @module Validations
 */

import { API_CONFIG } from '@/lib/api-config';
import { TX_HASH_REGEX } from '@/lib/validations/payments';
import { z } from 'zod';

export const V1CreateOrderSchema = z.object({
  productId: z.string().uuid(),
  customerRef: z.string().min(1).max(120),
  quantity: z.number().int().min(1).optional(),
});

export const V1Bep20PaySchema = z.object({
  txHash: z.string().regex(TX_HASH_REGEX, 'Invalid transaction hash format'),
});

export const V1BinanceVerifySchema = z.object({
  binanceOrderId: z.string().min(5).max(50),
});

export const V1WebhookCreateSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(API_CONFIG.webhooks.events)).min(1),
});

export const V1WebhookDeleteSchema = z.object({
  webhookId: z.string().uuid(),
});

export const DashboardCreateApiKeySchema = z.object({
  label: z.string().min(2).max(80),
  environment: z.enum(['live', 'test']),
  scopes: z.array(z.enum(API_CONFIG.allScopes)).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const DashboardCreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(API_CONFIG.webhooks.events)).min(1),
});
