/**
 * Overview for the signed-in owner or reseller. Read-only.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { getBotConnection } from '@/modules/bots';
import { parseOverviewRange, readOverview } from '@/modules/platform/overview';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to Overview', 403);
    }
    const db = asDbClient(session.admin);
    const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
    const bot = tenant ? await getBotConnection(db, tenant.id) : null;
    const first = session.profile.displayName.trim().split(/\s+/)[0] || 'there';
    const payload = await readOverview(db, {
      role,
      tenantId: tenant?.id ?? null,
      botId: bot?.id ?? null,
      firstName: first,
      timezone: session.profile.timezone,
    }, parseOverviewRange(new URL(request.url).searchParams.get('range')));
    return jsonSuccess(payload, 200, { cache: 'none' });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
