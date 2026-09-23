/**
 * @file app/api/resellers/route.ts
 *
 * GET, owner only. Lists tenants with profile and email information.
 *
 * @module Api
 */

import { handleRouteError, jsonSuccess } from '@/lib/http';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { pageMeta, parsePageParams } from '@/lib/pagination';
import { listResellerRows } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const { page, limit, offset } = parsePageParams(new URL(request.url).searchParams, { limit: 50 });
    const rows = await listResellerRows(asDbClient(session.admin));
    const emails = new Map<string, string>();
    try {
      const { data } = await session.admin.auth.admin.listUsers({ perPage: 1000 });
      for (const user of data.users) {
        if (user.email) {
          emails.set(user.id, user.email);
        }
      }
    } catch {
      // Auth admin listing is optional; table still works without emails.
    }
    const tenants = await session.admin
      .from('tenants')
      .select('id, owner_user_id')
      .in(
        'id',
        rows.map((row) => row.tenantId),
      );
    const ownerByTenant = new Map<string, string>();
    for (const raw of tenants.data ?? []) {
      const tenant = raw as { id: string; owner_user_id: string };
      ownerByTenant.set(tenant.id, tenant.owner_user_id);
    }
    const withEmail = rows.map((row) => {
      const ownerUserId = ownerByTenant.get(row.tenantId);
      return {
        ...row,
        email: ownerUserId ? (emails.get(ownerUserId) ?? row.email) : row.email,
        joinedAt: row.joinedAt.toISOString(),
        walletAvailableMinor: row.walletAvailableMinor.toString(),
      };
    });
    return jsonSuccess(
      {
        rows: withEmail.slice(offset, offset + limit),
        meta: pageMeta(page, limit, withEmail.length),
      },
      200,
      { cache: 'short' },
    );
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
