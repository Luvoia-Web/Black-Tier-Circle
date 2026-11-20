/**
 * @file app/api/orders/[orderId]/note/route.ts
 *
 * POST, owner only. Adds an internal order note.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { OrderNoteSchema } from '@/lib/validations/fulfillment';
import { addOrderNote } from '@/modules/orders';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    await assertRateLimit(`order-note:${session.user.id}`, 30);
    const parsed = OrderNoteSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    await addOrderNote(db, context.params.orderId, session.user.id, parsed.note);
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: null,
      action: 'order.note',
      target_type: 'order',
      target_id: context.params.orderId,
      reason: parsed.note.slice(0, 200),
    });
    return jsonSuccess({ success: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
