/**
 * @file app/api/intelligence/outcome/route.ts
 *
 * Records whether a recommendation converted, was rejected, or is pending.
 * Tenant id comes from the session. Hindsight failures still return success.
 *
 * @module Api
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { recordRecommendationOutcome, resolveCustomerMemoryBank, resolveTenantMemoryBank } from '@/lib/hindsight';
import { DEMO_CUSTOMER_ID, DEMO_TENANT_ID, isLocalDemoProbe } from '@/lib/intelligence-demo';
import { assertTenantCustomer, requireResellerMemory } from '@/lib/intelligence-session';
import { runOutcomeLearningLoop } from '@/lib/outcome-learning-loop';
import { AppError } from '@/lib/errors';
import { handleRouteError, readJsonBody } from '@/lib/http';
import { RecommendationOutcomeSchema } from '@/lib/validations/intelligence';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = RecommendationOutcomeSchema.parse(await readJsonBody(request));
    const demo = isLocalDemoProbe(request) && parsed.customerId === DEMO_CUSTOMER_ID;
    const session = demo ? null : await requireResellerMemory();
    if (!demo && session) {
      await assertTenantCustomer(session, parsed.customerId);
    }
    const tenantId = demo ? DEMO_TENANT_ID : (session?.tenantId ?? '');
    try {
      await recordRecommendationOutcome(
        resolveCustomerMemoryBank(tenantId, parsed.customerId),
        resolveTenantMemoryBank(tenantId),
        `outcome-${Date.now()}`,
        parsed.outcome,
        `customer:${parsed.customerId} ${parsed.outcome} recommendation — ${parsed.context}`,
      );
    } catch {
      // MemoryOS failure must not change the commerce response.
    }
    if (parsed.outcome === 'converted' || parsed.outcome === 'rejected') {
      // Fire and forget — never await, never block the response.
      void runOutcomeLearningLoop(tenantId, parsed.customerId, parsed.outcome, parsed.context).catch(() => {});
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof AppError || error instanceof ZodError) {
      return handleRouteError(error);
    }
    return NextResponse.json({ success: true });
  }
}
