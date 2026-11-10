import { z } from 'zod';

export const BulkTiersBodySchema = z
  .object({
    tiers: z
      .array(
        z.object({
          minQty: z.number().int().min(2).max(1_000_000),
          unitPrice: z.string().trim().min(1).max(24),
        }),
      )
      .max(5),
  })
  .strip();
