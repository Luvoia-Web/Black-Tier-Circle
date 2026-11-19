/**
 * @file app/api/intelligence/platform/route.ts
 *
 * Owner-only platform memory. Reflects and recalls the platform bank.
 * Customer banks are never read here.
 *
 * @module Api
 */

import { ZodError, z } from 'zod';

import { requireOwner } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import {
  recallTenantExperience,
  reflectStoreIntelligence,
  resolvePlatformMemoryBank,
  runMemoryObservation,
  toPublicMemory,
  type PublicMemory,
} from '@/lib/hindsight';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

const PlatformQuerySchema = z.object({
  query: z.string().max(2000).optional(),
});

const DEFAULT_QUERY = 'What operational patterns should the platform watch across stores?';

type PlatformIntelligence = {
  readonly memoryCount: number;
  readonly status: 'operational' | 'degraded';
  readonly degraded: boolean;
  readonly platformIntelligence: string | null;
  readonly recentEvents: readonly PublicMemory[];
  readonly evidence: readonly PublicMemory[];
};

const DEGRADED: PlatformIntelligence = {
  memoryCount: 0,
  status: 'degraded',
  degraded: true,
  platformIntelligence: null,
  recentEvents: [],
  evidence: [],
};

export async function POST(request: Request): Promise<Response> {
  try {
    await requireOwner();
    const parsed = PlatformQuerySchema.parse(await readJsonBody(request));
    const query = parsed.query?.trim() || DEFAULT_QUERY;
    const bankId = resolvePlatformMemoryBank();
    const observed = await runMemoryObservation(async () => {
      const decision = await reflectStoreIntelligence(bankId, query);
      const recent = await recallTenantExperience(bankId, 'recent platform events');
      return { decision, recent };
    });
    if (observed.degraded || observed.result === null) {
      return jsonSuccess(DEGRADED);
    }
    const intelligence = observed.result.decision.reason.trim();
    const recentEvents = observed.result.recent.map(toPublicMemory);
    return jsonSuccess({
      memoryCount: recentEvents.length,
      status: 'operational' as const,
      degraded: false,
      platformIntelligence: intelligence.length > 0 ? intelligence : null,
      recentEvents,
      evidence: observed.result.decision.memories.map(toPublicMemory),
    });
  } catch (error: unknown) {
    if (error instanceof AppError || error instanceof ZodError) {
      return handleRouteError(error);
    }
    return jsonSuccess(DEGRADED);
  }
}

export async function GET(): Promise<Response> {
  try {
    await requireOwner();
    const observed = await runMemoryObservation(async () =>
      recallTenantExperience(resolvePlatformMemoryBank(), 'platform activity'),
    );
    if (observed.degraded || observed.result === null) {
      return jsonSuccess(DEGRADED);
    }
    return jsonSuccess({
      ...DEGRADED,
      memoryCount: observed.result.length,
      status: 'operational' as const,
      degraded: false,
      recentEvents: observed.result.map(toPublicMemory),
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return handleRouteError(error);
    }
    return jsonSuccess(DEGRADED);
  }
}
