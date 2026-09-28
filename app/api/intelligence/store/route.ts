/**
 * @file app/api/intelligence/store/route.ts
 *
 * Store-level memory for the authenticated reseller.
 * Tenant id comes from the session, never the request body.
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
  type PublicMemory,
} from '@/lib/hindsight';
import { DEMO_TENANT_ID, isLocalDemoProbe } from '@/lib/intelligence-demo';
import { requireResellerMemory } from '@/lib/intelligence-session';
import { AppError } from '@/lib/errors';
import { handleRouteError, readJsonBody } from '@/lib/http';
import { StoreIntelligenceSchema } from '@/lib/validations/intelligence';

export const dynamic = 'force-dynamic';

const DEGRADED = {
  intelligence: null,
  evidence: [],
  sellerInstructions: [],
  degraded: true,
};

const DEFAULT_QUESTION =
  'What patterns has this store learned? What objections come up most? What recommendations convert best?';

function isSellerInstruction(memory: PublicMemory): boolean {
  return (
    memory.tags.includes('kind:seller_instruction') ||
    memory.tags.includes('seller_instruction') ||
    memory.type === 'kind:seller_instruction' ||
    memory.type === 'seller_instruction'
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const demo = isLocalDemoProbe(request);
    const session = demo ? null : await requireResellerMemory();
    const parsed = StoreIntelligenceSchema.parse(await readJsonBody(request));
    const question = parsed.question?.trim() || DEFAULT_QUESTION;
    const bankId = resolveTenantMemoryBank(demo ? DEMO_TENANT_ID : (session?.tenantId ?? DEMO_TENANT_ID));
    const observed = await runMemoryObservation(async () => {
      const decision = await reflectStoreIntelligence(bankId, question);
      const recalled = await recallTenantExperience(bankId, 'seller instructions and fulfillment patterns');
      return { decision, recalled };
    });
    if (observed.degraded || observed.result === null) {
      return NextResponse.json(DEGRADED, { status: 200 });
    }
    const intelligence = observed.result.decision.reason.trim();
    const recalled = observed.result.recalled.map(toPublicMemory);
    return NextResponse.json({
      intelligence: intelligence.length > 0 ? intelligence : null,
      evidence: observed.result.decision.memories.map(toPublicMemory),
      sellerInstructions: recalled.filter(isSellerInstruction),
      degraded: false,
    });
  } catch (error: unknown) {
    if (error instanceof AppError || error instanceof ZodError) {
      return handleRouteError(error);
    }
    return NextResponse.json(DEGRADED, { status: 200 });
  }
}
