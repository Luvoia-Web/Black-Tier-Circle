import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { createFreebie, listGrowthFreebies } from '@/modules/referrals/admin';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    return jsonSuccess({ freebies: await listGrowthFreebies(asDbClient(session.admin), null) });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    assertRateLimit(`growth:${session.user.id}`, 30);
    await createFreebie(asDbClient(session.admin), null, session.user.id, await readJsonBody(request));
    return jsonSuccess({ created: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
