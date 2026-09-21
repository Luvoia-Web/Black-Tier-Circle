/**
 * @file app/api/supplier/[orderId]/manual-fail/route.ts
 *
 * POST, owner only. Marks a supplier order failed and releases the reservation.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { SupplierManualFailSchema } from '@/lib/validations/fulfillment';
import { markSupplierManuallyFailed } from '@/modules/fulfillment';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const parsed = SupplierManualFailSchema.parse(await readJsonBody(request));
    await markSupplierManuallyFailed(
      asDbClient(session.admin),
      context.params.orderId,
      session.user.id,
      parsed.note,
    );
    return jsonSuccess({ success: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
