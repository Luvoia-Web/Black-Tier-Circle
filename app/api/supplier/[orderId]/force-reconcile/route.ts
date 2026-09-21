/**
 * @file app/api/supplier/[orderId]/force-reconcile/route.ts
 *
 * POST, owner only. Forces immediate reconciliation for one outcome_unknown order.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { reconcileSupplierOrder } from '@/modules/fulfillment';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const outcome = await reconcileSupplierOrder(asDbClient(session.admin), context.params.orderId);
    return jsonSuccess({ outcome });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
