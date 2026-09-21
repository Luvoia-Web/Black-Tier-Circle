/**
 * @file app/api/admin/tokens/route.ts
 *
 * GET + POST, owner only. List and create top-up tokens.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
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
    return jsonSuccess(tokens);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const parsed = CreateTopupTokenSchema.parse(await readJsonBody(request));
    const token = await createTopupToken(asDbClient(session.admin), session.user.id, {
      amountUsdt: parsed.amountUsdtStr,
      ...(parsed.tenantId !== undefined ? { tenantId: parsed.tenantId } : {}),
      ...(parsed.expiresAt !== undefined ? { expiresAt: new Date(parsed.expiresAt) } : {}),
    });
    return jsonSuccess(
      {
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
