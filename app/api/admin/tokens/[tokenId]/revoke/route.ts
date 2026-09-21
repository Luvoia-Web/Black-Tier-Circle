/**
 * @file app/api/admin/tokens/[tokenId]/revoke/route.ts
 *
 * POST, owner only. Revokes an active top-up token.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { revokeTopupToken } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly tokenId: string };
};

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const token = await revokeTopupToken(asDbClient(session.admin), context.params.tokenId, session.user.id);
    return jsonSuccess(token);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
