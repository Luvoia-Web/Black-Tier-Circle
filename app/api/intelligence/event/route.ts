/**
 * @file app/api/intelligence/event/route.ts
 *
 * Universal event ingestion. Any authenticated caller can retain an event
 * into the bank their session is allowed to write. Tenant id comes from
 * the session, never the body.
 *
 * @module Api
 */

import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';

import { requireOwner } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import {
  resolveCustomerMemoryBank,
  resolvePlatformMemoryBank,
  resolveTenantMemoryBank,
  retainCommerceExperience,
} from '@/lib/hindsight';
import { assertTenantCustomer, requireOperatorMemory } from '@/lib/intelligence-session';
import { handleRouteError, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

const EventSchema = z
  .object({
    bankTarget: z.enum(['platform', 'tenant', 'customer']),
    eventType: z.string().trim().min(1).max(120),
    content: z.string().trim().min(1).max(8000),
    customerId: z.string().trim().min(1).max(200).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    documentId: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((value, context) => {
    if (value.bankTarget === 'customer' && (value.customerId === undefined || value.customerId.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'customerId is required when bankTarget is customer',
        path: ['customerId'],
      });
    }
  });

const DEGRADED = { success: false, degraded: true };

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = EventSchema.parse(await readJsonBody(request));
    let bankId: string;
    if (parsed.bankTarget === 'platform') {
      await requireOwner();
      bankId = resolvePlatformMemoryBank();
    } else {
      const session = await requireOperatorMemory();
      if (parsed.bankTarget === 'customer') {
        const customerId = parsed.customerId ?? '';
        await assertTenantCustomer(session, customerId);
        bankId = resolveCustomerMemoryBank(session.tenantId, customerId);
      } else {
        bankId = resolveTenantMemoryBank(session.tenantId);
      }
    }
    const documentId = parsed.documentId ?? `event-${parsed.eventType}-${Date.now()}`;
    let stored = false;
    try {
      stored = await retainCommerceExperience(
        bankId,
        documentId,
        parsed.content,
        [`event:${parsed.eventType}`, ...(parsed.tags ?? []), 'fact:observation'],
        `event ${parsed.eventType}`,
      );
    } catch {
      stored = false;
    }
    if (!stored) {
      return NextResponse.json(DEGRADED);
    }
    return NextResponse.json({ success: true, bankId, documentId });
  } catch (error: unknown) {
    if (error instanceof AppError || error instanceof ZodError) {
      return handleRouteError(error);
    }
    return NextResponse.json(DEGRADED);
  }
}
