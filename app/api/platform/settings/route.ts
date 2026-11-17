/**
 * Settings reads and the owner reseller policy.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { loadFraudThresholds } from '@/modules/platform/fraud';
import { readResellerPolicy, RESELLER_POLICY_FIELDS, saveResellerPolicy } from '@/modules/platform/policy';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

async function scope() {
  const session = await requireUser();
  const role = session.profile.role;
  if (role !== 'owner' && role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to settings', 403);
  }
  const db = asDbClient(session.admin);
  const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
  return { db, role, tenantName: tenant?.displayName ?? null, displayName: session.profile.displayName };
}

export async function GET(): Promise<Response> {
  try {
    const current = await scope();
    const policy = await readResellerPolicy(current.db);
    const fraud = await loadFraudThresholds(current.db);
    return jsonSuccess({
      role: current.role,
      displayName: current.displayName,
      tenantName: current.tenantName,
      needsMigration: policy.needsMigration || fraud.needsMigration,
      fields: RESELLER_POLICY_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        allowed: policy.policy[field.key] !== false,
      })),
      fraud: fraud.thresholds,
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const current = await scope();
    if (current.role !== 'owner') {
      throw new AuthError('FORBIDDEN', 'Only the owner can change the reseller policy', 403);
    }
    const body = (await readJsonBody(request)) as { policy?: Record<string, unknown> };
    const saved = await saveResellerPolicy(current.db, body.policy ?? {});
    return jsonSuccess(saved);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
