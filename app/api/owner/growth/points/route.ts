import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { adjustCustomerPoints } from '@/modules/referrals/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    assertRateLimit(`growth:${session.user.id}`, 30);
    const result = await adjustCustomerPoints(asDbClient(session.admin), null, session.user.id, await readJsonBody(request));
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
