/**
 * @file app/api/admin/payments/[orderId]/override/route.ts
 *
 * POST, owner only. Manual payment override.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { PaymentOverrideSchema } from '@/lib/validations/payments';
import { manualOverridePayment } from '@/modules/payments';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const parsed = PaymentOverrideSchema.parse(await readJsonBody(request));
    await manualOverridePayment(
      asDbClient(session.admin),
      context.params.orderId,
      parsed.action,
      session.user.id,
      parsed.reason,
    );
    return jsonSuccess({ ok: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
