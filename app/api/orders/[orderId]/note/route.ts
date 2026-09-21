/**
 * @file app/api/orders/[orderId]/note/route.ts
 *
 * POST, owner only. Adds an internal order note.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { OrderNoteSchema } from '@/lib/validations/fulfillment';
import { addOrderNote } from '@/modules/orders';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const parsed = OrderNoteSchema.parse(await readJsonBody(request));
    await addOrderNote(asDbClient(session.admin), context.params.orderId, session.user.id, parsed.note);
    return jsonSuccess({ success: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
