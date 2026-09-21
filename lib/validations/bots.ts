/**
 * @file lib/validations/bots.ts
 *
 * Zod schemas for bot connection APIs.
 *
 * @module Validations
 */

import { z } from 'zod';

export const ConnectBotSchema = z.object({
  botToken: z.string().min(20, 'Bot token is required'),
});

export type ConnectBotBody = z.infer<typeof ConnectBotSchema>;
