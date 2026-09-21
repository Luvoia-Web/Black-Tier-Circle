/**
 * @file lib/validations/fulfillment.ts
 *
 * Zod schemas for fulfillment and order support APIs.
 *
 * @module Validations
 */

import { z } from 'zod';

export const ManualCompleteSchema = z.object({
  note: z.string().max(500).optional(),
});

export const OrderNoteSchema = z.object({
  note: z.string().min(3).max(500),
});

export const CancelOrderSchema = z.object({
  reason: z.string().min(3).max(500).optional(),
});
