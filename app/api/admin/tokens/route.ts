/**
 * @file app/api/admin/tokens/route.ts
 *
 * GET + POST, owner only. List and create top-up tokens.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { CreateTopupTokenSchema, TokenStatusQuerySchema } from '@/lib/validations/wallet';
import { createTopupToken, listTopupTokens, type TokenStatus } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const tenantId = url.searchParams.get('tenantId');
    const statusParsed = statusParam ? TokenStatusQuerySchema.safeParse(statusParam) : null;
    const tokens = await listTopupTokens(asDbClient(session.admin), {
      ...(statusParsed?.success ? { status: statusParsed.data as TokenStatus } : {}),
      ...(tenantId ? { tenantId } : {}),
    });
    return jsonSuccess(tokens, 200, { cache: 'short' });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const rate = await consumeRateLimit({ key: `tokens:create:${session.user.id}`, limit: 20, fail: 'closed' });
    if (!rate.allowed) {
      throw new ValidationError('RATE_LIMITED', 'Too many tokens created. Please wait a minute.');
    }
    const parsed = CreateTopupTokenSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const token = await createTopupToken(db, session.user.id, {
      amountUsdt: parsed.amountUsdtStr,
      ...(parsed.tenantId !== undefined ? { tenantId: parsed.tenantId } : {}),
      ...(parsed.expiresAt !== undefined ? { expiresAt: new Date(parsed.expiresAt) } : {}),
    });
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: parsed.tenantId ?? null,
      action: 'token.create',
      target_type: 'topup_token',
      target_id: token.id,
      reason: `Created top-up token ${parsed.amountUsdtStr} USDT`,
    });
    return jsonSuccess(
      {
        id: token.id,
        token: token.token,
        amountUsdt: token.amountUsdt,
        expiresAt: token.expiresAt,
      },
      201,
    );
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
