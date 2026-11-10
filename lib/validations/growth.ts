import { z } from 'zod';
import { referralConfigSchema } from '@/modules/store-config/schema';

export const GrowthSettingsSchema = referralConfigSchema;

export const RejectReferralSchema = z
  .object({
    referralId: z.string().uuid(),
    reason: z.string().trim().min(1).max(200),
  })
  .strict();

export const AdjustPointsSchema = z
  .object({
    customerId: z.string().uuid(),
    delta: z.number().int().min(-1_000_000).max(1_000_000),
    reason: z.string().trim().min(1).max(200),
    requestId: z.string().trim().min(8).max(80),
  })
  .strict();

export const FreebieSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(400).default(''),
    kind: z.enum(['text', 'link']),
    content: z.string().trim().min(1).max(2000),
    requiredReferrals: z.number().int().min(0).max(10_000).default(2),
    active: z.boolean().default(true),
  })
  .strict();

export const FreebiePatchSchema = FreebieSchema.partial().extend({
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export const ReferralQuerySchema = z.object({
  status: z.enum(['all', 'pending', 'qualified', 'rejected']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
