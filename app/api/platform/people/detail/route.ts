/**
 * @file app/api/platform/people/detail/route.ts
 *
 * One buyer or reseller for the People drawer.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { getBotConnection } from '@/modules/bots';
import { readPerson } from '@/modules/platform/people';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to people', 403);
    }
    const db = asDbClient(session.admin);
    const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
    const connection = tenant ? await getBotConnection(db, tenant.id) : null;
    const url = new URL(request.url);
    const person = await readPerson(db, {
      id: url.searchParams.get('id') ?? '',
      kind: url.searchParams.get('kind') ?? 'buyer',
      role,
      botId: connection?.id ?? null,
    });
    return jsonSuccess({ person });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
