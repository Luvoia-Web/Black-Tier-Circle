/**
 * @file app/api/intelligence/customer/route.ts
 *
 * Customer memory recall and recommendation. Server-side only.
 * Tenant id comes from the authenticated reseller session.
 *
 * @module Api
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import {
  recallCustomerExperience,
  reflectCustomerIntelligence,
  resolveCustomerMemoryBank,
  runMemoryObservation,
  toPublicMemory,
} from '@/lib/hindsight';
import { isLocalDemoProbe } from '@/lib/intelligence-demo';
import { assertTenantCustomer, requireResellerMemory } from '@/lib/intelligence-session';
import { AppError, ValidationError } from '@/lib/errors';
import { handleRouteError, readJsonBody } from '@/lib/http';
import { CustomerIntelligenceSchema } from '@/lib/validations/intelligence';

export const dynamic = 'force-dynamic';

const DEGRADED = {
  memories: [],
  recommendation: null,
  evidence: [],
  degraded: true,
};

const DEFAULT_RECALL = "What are this customer's preferences, objections, and purchase history?";
const DEFAULT_REFLECT = "Based on this customer's history, what is the best recommendation?";

function degradedResponse(): Response {
  return NextResponse.json(DEGRADED, { status: 200 });
}

async function resolveCustomer(request: Request): Promise<{ tenantId: string; customerId: string }> {
  if (isLocalDemoProbe(request)) {
    return { tenantId: 'demo-store-1', customerId: 'demo-customer-1' };
  }
  const session = await requireResellerMemory();
  const requested = new URL(request.url).searchParams.get('customerId')?.trim() ?? '';
  if (requested.length > 0 && requested !== session.userId) {
    await assertTenantCustomer(session, requested);
    return { tenantId: session.tenantId, customerId: requested };
  }
  return { tenantId: session.tenantId, customerId: session.userId };
}

function routeError(error: unknown): Response {
  if (error instanceof AppError || error instanceof ZodError) {
    return handleRouteError(error);
  }
  return degradedResponse();
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { tenantId, customerId } = await resolveCustomer(request);
    const parsed = CustomerIntelligenceSchema.parse(await readJsonBody(request));
    const recallQuery = parsed.query?.trim() || DEFAULT_RECALL;
    const reflectQuery = parsed.currentContext
      ? `${parsed.currentContext} — Based on this customer's history, what should the reseller do?`
      : DEFAULT_REFLECT;
    const bankId = resolveCustomerMemoryBank(tenantId, customerId);
    const observed = await runMemoryObservation(async () => {
      const memories = await recallCustomerExperience(bankId, recallQuery);
      const decision = await reflectCustomerIntelligence(bankId, reflectQuery);
      return { memories, decision };
    });
    if (observed.degraded || observed.result === null) {
      return degradedResponse();
    }
    const recommendation = observed.result.decision.reason.trim();
    return NextResponse.json({
      memories: observed.result.memories.map(toPublicMemory),
      recommendation: recommendation.length > 0 ? recommendation : null,
      evidence: observed.result.decision.memories.map(toPublicMemory),
      degraded: false,
    });
  } catch (error: unknown) {
    return routeError(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const decisionId = new URL(request.url).searchParams.get('decisionId')?.trim() ?? '';
    if (decisionId.length === 0) {
      throw new ValidationError('INVALID_INPUT', 'decisionId is required');
    }
    const { tenantId, customerId } = await resolveCustomer(request);
    const bankId = resolveCustomerMemoryBank(tenantId, customerId);
    const observed = await runMemoryObservation(async () =>
      recallCustomerExperience(bankId, `evidence for decision ${decisionId}`),
    );
    if (observed.degraded || observed.result === null) {
      return NextResponse.json({ memories: [], degraded: true }, { status: 200 });
    }
    return NextResponse.json({
      memories: observed.result.map(toPublicMemory),
      degraded: false,
    });
  } catch (error: unknown) {
    if (error instanceof AppError || error instanceof ZodError) {
      return handleRouteError(error);
    }
    return NextResponse.json({ memories: [], degraded: true }, { status: 200 });
  }
}
