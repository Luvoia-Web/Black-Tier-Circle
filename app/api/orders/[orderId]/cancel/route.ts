/**
 * @file app/api/orders/[orderId]/cancel/route.ts
 *
 * POST, owner only. Cancels an unfulfilled order and releases reservation.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { CancelOrderSchema } from '@/lib/validations/fulfillment';
import { cancelOrder } from '@/modules/orders';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    await assertRateLimit(`order-cancel:${session.user.id}`, 30);
    let raw: Record<string, unknown> = {};
    try {
      raw = await readJsonBody(request);
    } catch {
      raw = {};
    }
    const parsed = CancelOrderSchema.parse(raw);
    const db = asDbClient(session.admin);
    const reason = parsed.reason ?? 'Cancelled by owner';
    await cancelOrder(db, context.params.orderId, reason);
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: null,
      action: 'order.cancelled',
      target_type: 'order',
      target_id: context.params.orderId,
      reason,
    });
    return jsonSuccess({ success: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
