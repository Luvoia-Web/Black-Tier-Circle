/**
 * @file lib/validations/intelligence.ts
 *
 * Zod schemas for MemoryOS API routes.
 *
 * @module Validations
 */

import { z } from 'zod';

export const CustomerIntelligenceSchema = z.object({
  query: z.string().max(2000).optional(),
  currentContext: z.string().max(4000).optional(),
});

export const StoreIntelligenceSchema = z.object({
  question: z.string().max(2000).optional(),
});

export const RecoveryIntelligenceSchema = z.object({
  incidentType: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
});

export const RecommendationOutcomeSchema = z.object({
  customerId: z.string().min(1).max(200),
  outcome: z.enum(['converted', 'rejected', 'pending']),
  context: z.string().max(4000),
});
