/**
 * @file app/api/orders/[orderId]/cancel/route.ts
 *
 * POST, owner only. Cancels an unfulfilled order and releases reservation.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { CancelOrderSchema } from '@/lib/validations/fulfillment';
import { cancelOrder } from '@/modules/orders';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    let raw: Record<string, unknown> = {};
    try {
      raw = await readJsonBody(request);
    } catch {
      raw = {};
    }
    const parsed = CancelOrderSchema.parse(raw);
    await cancelOrder(
      asDbClient(session.admin),
      context.params.orderId,
      parsed.reason ?? 'Cancelled by owner',
    );
    return jsonSuccess({ success: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
