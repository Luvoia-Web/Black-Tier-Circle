import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { updateFreebie } from '@/modules/referrals/admin';

export const dynamic = 'force-dynamic';

type RouteContext = { params: { freebieId: string } };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireReseller();
    assertRateLimit(`growth:${session.user.id}`, 30);
    await updateFreebie(
      asDbClient(session.admin),
      session.tenant.id,
      session.user.id,
      context.params.freebieId,
      await readJsonBody(request),
    );
    return jsonSuccess({ updated: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
