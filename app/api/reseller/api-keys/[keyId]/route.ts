/**
 * @file app/api/reseller/api-keys/[keyId]/route.ts
 *
 * DELETE: revoke a tenant API key.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listApiKeys, revokeApiKey } from '@/modules/public-api';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: { keyId: string };
};

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireReseller();
    const db = asDbClient(session.admin);
    const keys = await listApiKeys(db, session.tenant.id);
    if (!keys.some((key) => key.id === context.params.keyId)) {
      throw new AuthError('FORBIDDEN', 'API key does not belong to this tenant', 403);
    }
    await revokeApiKey(db, context.params.keyId, session.profile.id);
    return jsonSuccess({ revoked: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
