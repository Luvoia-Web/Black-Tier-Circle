/**
 * @file app/api/admin/tokens/[tokenId]/revoke/route.ts
 *
 * POST, owner only. Revokes an active top-up token.
 *
 * @module Api
 */

import { z } from 'zod';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { revokeTopupToken } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly tokenId: string };
};

const IdSchema = z.string().uuid();

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const rate = await consumeRateLimit({ key: `tokens:revoke:${session.user.id}`, limit: 30, fail: 'closed' });
    if (!rate.allowed) {
      throw new ValidationError('RATE_LIMITED', 'Too many token actions. Please wait a minute.');
    }
    const tokenId = IdSchema.parse(context.params.tokenId);
    const db = asDbClient(session.admin);
    const token = await revokeTopupToken(db, tokenId, session.user.id);
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: token.tenantId ?? null,
      action: 'token.revoke',
      target_type: 'topup_token',
      target_id: tokenId,
      reason: 'Revoked credit token',
    });
    return jsonSuccess(token);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
