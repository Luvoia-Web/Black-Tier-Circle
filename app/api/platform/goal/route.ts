/**
 * Owner store goal on platform_settings. Reseller store goal on tenant_settings.
 * The tenant id comes from the session. A missing 0033 column returns
 * needsMigration so the ring can fall back to localStorage.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { parseGoalUsdt, readRevenueGoal, writeRevenueGoal } from '@/modules/platform/goal';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

async function scope() {
  const session = await requireUser();
  const role = session.profile.role;
  if (role !== 'owner' && role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to this workspace', 403);
  }
  const db = asDbClient(session.admin);
  const tenantId = role === 'reseller' ? (await getTenantByUserId(db, session.user.id)).id : null;
  return { db, role, tenantId };
}

export async function GET(): Promise<Response> {
  try {
    const current = await scope();
    const goal = await readRevenueGoal(current.db, { role: current.role, tenantId: current.tenantId });
    return jsonSuccess(goal, 200, { cache: 'none' });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const body = await readJsonBody(request);
    const minor = parseGoalUsdt(body.goal ?? body.goalUsdt);
    const goal = await writeRevenueGoal(current.db, { role: current.role, tenantId: current.tenantId }, minor);
    return jsonSuccess(goal, 200, { cache: 'none' });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
