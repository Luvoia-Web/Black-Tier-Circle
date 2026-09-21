/**
 * @file app/api/reseller/deliveries/[orderId]/route.ts
 *
 * POST: reseller delivers manual content via Telegram.
 *
 * Phase 9 auth audit: getUser() via requireReseller, tenant_id from session.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { DeliverOrderSchema } from '@/lib/validations/tenant-settings';
import { deliverResellerManualOrder } from '@/modules/fulfillment';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireReseller();
    const parsed = DeliverOrderSchema.parse(await readJsonBody(request));
    await deliverResellerManualOrder(
      asDbClient(session.admin),
      context.params.orderId,
      session.tenant.id,
      session.user.id,
      parsed.content,
    );
    return jsonSuccess({ success: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
