/**
 * @file app/api/intelligence/platform/route.ts
 *
 * Owner-only platform memory. Reflects and recalls the platform bank.
 * Customer banks are never read here.
 *
 * @module Api
 */

import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';

import { requireOwner } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import {
  recallTenantExperience,
  reflectStoreIntelligence,
  resolvePlatformMemoryBank,
  runMemoryObservation,
  toPublicMemory,
} from '@/lib/hindsight';
import { handleRouteError, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

const PlatformQuerySchema = z.object({
  query: z.string().max(2000).optional(),
});

const DEFAULT_QUERY = 'What operational patterns should the platform watch across stores?';

const DEGRADED_POST = {
  platformIntelligence: null,
  recentEvents: [],
  evidence: [],
  degraded: true,
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
      return NextResponse.json(DEGRADED_POST);
    }
    const intelligence = observed.result.decision.reason.trim();
    return NextResponse.json({
      platformIntelligence: intelligence.length > 0 ? intelligence : null,
      recentEvents: observed.result.recent.map(toPublicMemory),
      evidence: observed.result.decision.memories.map(toPublicMemory),
      degraded: false,
    });
  } catch (error: unknown) {
    if (error instanceof AppError || error instanceof ZodError) {
      return handleRouteError(error);
    }
    return NextResponse.json(DEGRADED_POST);
  }
}

export async function GET(): Promise<Response> {
  try {
    await requireOwner();
    const observed = await runMemoryObservation(async () =>
      recallTenantExperience(resolvePlatformMemoryBank(), 'platform activity'),
    );
    if (observed.degraded || observed.result === null) {
      return NextResponse.json({ memoryCount: 0, status: 'degraded', degraded: true });
    }
    return NextResponse.json({
      memoryCount: observed.result.length,
      status: 'operational',
      degraded: false,
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return handleRouteError(error);
    }
    return NextResponse.json({ memoryCount: 0, status: 'degraded', degraded: true });
  }
}
