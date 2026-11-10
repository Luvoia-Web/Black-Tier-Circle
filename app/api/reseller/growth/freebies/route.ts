import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { createFreebie, listGrowthFreebies } from '@/modules/referrals/admin';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    return jsonSuccess({ freebies: await listGrowthFreebies(asDbClient(session.admin), session.tenant.id) });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    assertRateLimit(`growth:${session.user.id}`, 30);
    await createFreebie(asDbClient(session.admin), session.tenant.id, session.user.id, await readJsonBody(request));
    return jsonSuccess({ created: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
