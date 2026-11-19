/**
 * @file app/api/platform/replacements/route.ts
 *
 * Owner-initiated warranty replacements and request reviews.
 */

import { z } from 'zod';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { decideReplacement, listReplacements, ownerReplace } from '@/modules/platform/replacements';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

const ReplaceSchema = z.object({
  decision: z.literal('replace'),
  orderId: z.string().uuid(),
  mode: z.enum(['supplier', 'manual']),
  content: z.string().max(3500).optional(),
  note: z.string().max(1000).optional(),
  threadId: z.string().uuid().optional(),
});

const DecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  id: z.string().uuid(),
  note: z.string().max(1000).optional(),
});

const PostSchema = z.discriminatedUnion('decision', [ReplaceSchema, DecisionSchema]);

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
    const rate = await consumeRateLimit({ key: `replacements:${current.actorId}`, limit: 20, fail: 'closed' });
    if (!rate.allowed) {
      throw new ValidationError('RATE_LIMITED', 'Too many replacement requests. Please wait a minute.');
    }
    const parsed = PostSchema.parse(await readJsonBody(request));
    if (parsed.decision === 'replace') {
      if (!current.owner) {
        throw new AuthError('FORBIDDEN', 'Only the owner can replace a delivered order', 403);
      }
      const replaced = await ownerReplace(current.db, {
        orderId: parsed.orderId,
        actorId: current.actorId,
        mode: parsed.mode,
        ...(parsed.content !== undefined ? { content: parsed.content } : {}),
        ...(parsed.note !== undefined ? { reason: parsed.note } : {}),
        ...(parsed.threadId !== undefined ? { threadId: parsed.threadId } : {}),
      });
      return jsonSuccess({
        orderId: parsed.orderId,
        decision: 'replace',
        support: replaced.support,
        threadId: replaced.threadId,
      });
    }

    await decideReplacement(current.db, {
      id: parsed.id,
      tenantId: current.tenantId,
      owner: current.owner,
      decision: parsed.decision,
      note: parsed.note ?? '',
    });
    await current.db.from('audit_log').insert({
      actor_id: current.actorId,
      tenant_id: current.tenantId,
      action: parsed.decision === 'approved' ? 'replacement.approved' : 'replacement.rejected',
      target_type: 'replacement_request',
      target_id: parsed.id,
      reason: parsed.note?.trim() || `Marked replacement ${parsed.decision}`,
    });
    return jsonSuccess({ id: parsed.id, decision: parsed.decision });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
