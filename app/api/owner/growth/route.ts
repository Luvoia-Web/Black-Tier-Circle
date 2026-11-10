import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { growthOverview, saveGrowthSettings } from '@/modules/referrals/admin';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    return jsonSuccess(await growthOverview(asDbClient(session.admin), null));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    assertRateLimit(`growth:${session.user.id}`, 30);
    const body = (await readJsonBody(request)) as { settings?: unknown; version?: unknown };
    const version = typeof body.version === 'number' ? body.version : 0;
    const saved = await saveGrowthSettings(asDbClient(session.admin), null, session.user.id, body.settings, version);
    return jsonSuccess(saved);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
