/**
 * @file app/api/intelligence/recovery/route.ts
 *
 * Commerce recovery intelligence. Recalls what worked the last time
 * this kind of incident happened. Tenant id comes from the session.
 *
 * @module Api
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import {
  recallTenantExperience,
  reflectStoreIntelligence,
  resolveTenantMemoryBank,
  runMemoryObservation,
  toPublicMemory,
} from '@/lib/hindsight';
import { DEMO_TENANT_ID, isLocalDemoProbe } from '@/lib/intelligence-demo';
import { requireOperatorMemory } from '@/lib/intelligence-session';
import { AppError } from '@/lib/errors';
import { handleRouteError, readJsonBody } from '@/lib/http';
import { RecoveryIntelligenceSchema } from '@/lib/validations/intelligence';

export const dynamic = 'force-dynamic';

const DEGRADED = {
  pastIncidents: [],
  suggestedRecovery: null,
  evidence: [],
  degraded: true,
};

export async function POST(request: Request): Promise<Response> {
  try {
    const demo = isLocalDemoProbe(request);
    const session = demo ? null : await requireOperatorMemory();
    const parsed = RecoveryIntelligenceSchema.parse(await readJsonBody(request));
    const recallQuery = `Previous ${parsed.incidentType} incidents and how they were resolved: ${parsed.description}`;
    const reflectQuery = `Given this incident: ${parsed.description} — what recovery action worked before?`;
    const bankId = resolveTenantMemoryBank(demo ? DEMO_TENANT_ID : (session?.tenantId ?? DEMO_TENANT_ID));
    const observed = await runMemoryObservation(async () => {
      const pastIncidents = await recallTenantExperience(bankId, recallQuery);
      const decision = await reflectStoreIntelligence(bankId, reflectQuery);
      return { pastIncidents, decision };
    });
    if (observed.degraded || observed.result === null) {
      return NextResponse.json(DEGRADED, { status: 200 });
    }
    const suggestedRecovery = observed.result.decision.reason.trim();
    return NextResponse.json({
      pastIncidents: observed.result.pastIncidents.map(toPublicMemory),
      suggestedRecovery: suggestedRecovery.length > 0 ? suggestedRecovery : null,
      evidence: observed.result.decision.memories.map(toPublicMemory),
      degraded: false,
    });
  } catch (error: unknown) {
    if (error instanceof AppError || error instanceof ZodError) {
      return handleRouteError(error);
    }
    return NextResponse.json(DEGRADED, { status: 200 });
  }
}
