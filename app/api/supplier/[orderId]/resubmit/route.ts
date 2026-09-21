/**
 * @file app/api/supplier/[orderId]/resubmit/route.ts
 *
 * POST, owner only. Re-submits an order to the active supplier connector.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { resubmitSupplierOrder } from '@/modules/fulfillment';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    await resubmitSupplierOrder(asDbClient(session.admin), context.params.orderId, session.user.id);
    return jsonSuccess({ success: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
