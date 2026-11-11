import { asDbClient, requireReseller, requireRole } from '@/lib/auth/session';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { reviewWalletTopup } from '@/modules/topups/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: { topupId: string } }): Promise<Response> {
  try {
    const session = await requireRole(['owner', 'reseller']);
    assertRateLimit(`topup-review:${session.user.id}`, 20);
    const tenantId =
      session.profile.role === 'owner' ? null : (await requireReseller()).tenant.id;
    const body = (await readJsonBody(request)) as { decision?: unknown; reason?: unknown; txHash?: unknown };
    const decision = body.decision === 'reject' ? 'reject' : body.decision === 'approve' ? 'approve' : null;
    if (!decision || typeof body.reason !== 'string') {
      throw new ValidationError('INVALID_REVIEW', 'Choose approve or reject and enter a reason.');
    }
    const result = await reviewWalletTopup(asDbClient(session.admin), {
      actorId: session.user.id,
      tenantId,
      topupId: context.params.topupId,
      decision,
      reason: body.reason,
      ...(typeof body.txHash === 'string' ? { txHash: body.txHash } : {}),
    });
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
