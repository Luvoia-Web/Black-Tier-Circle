/**
 * @file app/api/platform/replacements/route.ts
 *
 * Owner and reseller decisions on warranty requests.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { decideReplacement, listReplacements, ownerReplace } from '@/modules/platform/replacements';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

async function scope() {
  const session = await requireUser();
  const role = session.profile.role;
  if (role !== 'owner' && role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to replacements', 403);
  }
  const db = asDbClient(session.admin);
  const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
  return { db, owner: role === 'owner', tenantId: tenant?.id ?? null, actorId: session.user.id };
}

export async function GET(): Promise<Response> {
  try {
    const current = await scope();
    return jsonSuccess(await listReplacements(current.db, current.tenantId, current.owner));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const body = (await readJsonBody(request)) as { id?: unknown; decision?: unknown; note?: unknown; orderId?: unknown; mode?: unknown; content?: unknown };
    if (body.decision === 'replace') {
      if (!current.owner || typeof body.orderId !== 'string') {
        throw new AuthError('FORBIDDEN', 'Only the owner can replace a delivered order', 403);
      }
      const mode = body.mode === 'supplier' || body.mode === 'manual' ? body.mode : null;
      if (!mode) {
        throw new ValidationError('REPLACEMENT_INVALID', 'Choose a new supplier item or paste the replacement.');
      }
      const replaced = await ownerReplace(current.db, {
        orderId: body.orderId,
        actorId: current.actorId,
        mode,
        ...(typeof body.content === 'string' ? { content: body.content } : {}),
        ...(typeof body.note === 'string' ? { reason: body.note } : {}),
      });
      return jsonSuccess({ orderId: body.orderId, decision: 'replace', support: replaced.support });
    }
    const decision = body.decision === 'approved' || body.decision === 'rejected' ? body.decision : null;
    if (typeof body.id !== 'string' || !decision) {
      throw new ValidationError('REPLACEMENT_INVALID', 'Choose a request and approve or reject it.');
    }
    await decideReplacement(current.db, {
      id: body.id,
      tenantId: current.tenantId,
      owner: current.owner,
      decision,
      note: typeof body.note === 'string' ? body.note : '',
    });
    return jsonSuccess({ id: body.id, decision });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
