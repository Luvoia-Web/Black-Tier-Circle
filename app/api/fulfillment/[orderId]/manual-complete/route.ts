/**
 * @file app/api/fulfillment/[orderId]/manual-complete/route.ts
 *
 * POST, owner only. Marks a manual order as fulfilled.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { ManualCompleteSchema } from '@/lib/validations/fulfillment';
import { markManualFulfilled } from '@/modules/fulfillment';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const parsed = ManualCompleteSchema.parse(await readJsonBody(request));
    await markManualFulfilled(asDbClient(session.admin), context.params.orderId, session.user.id, parsed.note);
    return jsonSuccess({ success: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
