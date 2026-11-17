/**
 * @file app/api/platform/today/route.ts
 *
 * Triage for the signed-in store. Reseller rows stay inside the tenant.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { getBotConnection } from '@/modules/bots';
import { readToday } from '@/modules/platform/today';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to Today', 403);
    }
    const db = asDbClient(session.admin);
    const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
    const bot = tenant ? await getBotConnection(db, tenant.id) : null;
    const payload = await readToday(db, {
      role,
      tenantId: tenant?.id ?? null,
      botId: bot?.id ?? null,
    });
    return jsonSuccess(payload);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
