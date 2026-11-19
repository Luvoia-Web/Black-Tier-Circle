/**
 * @file app/api/admin/payments/[orderId]/override/route.ts
 *
 * POST, owner only. Manual payment override.
 *
 * @module Api
 */

import { z } from 'zod';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { PaymentOverrideSchema } from '@/lib/validations/payments';
import { manualOverridePayment } from '@/modules/payments';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

const IdSchema = z.string().uuid();

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const rate = await consumeRateLimit({ key: `payment:override:${session.user.id}`, limit: 20, fail: 'closed' });
    if (!rate.allowed) {
      throw new ValidationError('RATE_LIMITED', 'Too many payment overrides. Please wait a minute.');
    }
    const orderId = IdSchema.parse(context.params.orderId);
    const parsed = PaymentOverrideSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    await manualOverridePayment(db, orderId, parsed.action, session.user.id, parsed.reason);
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      action: 'payment.override',
      target_type: 'order',
      target_id: orderId,
      reason: parsed.reason,
      after_val: { decision: parsed.action },
    });
    return jsonSuccess({ ok: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
