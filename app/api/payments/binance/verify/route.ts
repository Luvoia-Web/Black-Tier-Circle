/**
 * @file app/api/payments/binance/verify/route.ts
 *
 * POST, authenticated. Verifies a Binance Pay claim.
 *
 * @module Api
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertOrderPaymentAccess } from '@/lib/payment-access';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { BinancePayClaimSchema } from '@/lib/validations/payments';
import { getOrder } from '@/modules/orders';
import { resolveOrderPayments, verifyBinancePayClaim } from '@/modules/payments';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    assertRateLimit(`pay-verify:${session.user.id}`, 20);
    const parsed = BinancePayClaimSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const order = await getOrder(db, parsed.orderId);
    await assertOrderPaymentAccess(session, order);
    const result = await verifyBinancePayClaim(db, parsed);
    const resolved = await resolveOrderPayments(db, order.tenantId);
    return jsonSuccess({
      verified: result.verified,
      message: result.verified ? 'Payment verified' : (result.rejectReason ?? 'Payment not verified'),
      isDemoMode: resolved.binance === null,
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
