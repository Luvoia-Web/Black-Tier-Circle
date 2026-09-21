/**
 * @file app/api/supplier/[orderId]/manual-complete/route.ts
 *
 * POST, owner only. Marks a supplier order completed with owner-provided delivery data.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { SupplierManualCompleteSchema } from '@/lib/validations/fulfillment';
import { markSupplierManuallyCompleted } from '@/modules/fulfillment';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const parsed = SupplierManualCompleteSchema.parse(await readJsonBody(request));
    await markSupplierManuallyCompleted(
      asDbClient(session.admin),
      context.params.orderId,
      session.user.id,
      parsed.deliveryData,
      parsed.note,
    );
    return jsonSuccess({ success: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
