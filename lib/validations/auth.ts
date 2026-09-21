/**
 * @file lib/validations/auth.ts
 *
 * Zod schemas for Phase 1 auth, invite, and tenant status APIs.
 *
 * @module Validations
 */

import { z } from 'zod';

export const InviteCreateSchema = z.object({
  email: z.string().email(),
});

export const InviteAcceptSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(50),
});

export const UpdateTenantStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export type InviteCreateInput = z.infer<typeof InviteCreateSchema>;
export type InviteAcceptInput = z.infer<typeof InviteAcceptSchema>;
export type UpdateTenantStatusInput = z.infer<typeof UpdateTenantStatusSchema>;
