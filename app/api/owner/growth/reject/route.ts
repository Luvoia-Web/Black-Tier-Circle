import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { rejectReferral } from '@/modules/referrals/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    assertRateLimit(`growth:${session.user.id}`, 30);
    await rejectReferral(asDbClient(session.admin), null, session.user.id, await readJsonBody(request));
    return jsonSuccess({ rejected: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
