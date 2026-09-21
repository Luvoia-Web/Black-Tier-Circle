/**
 * @file app/api/resellers/route.ts
 *
 * GET, owner only. Lists tenants with profile and email information.
 *
 * @module Api
 */

import { handleRouteError, jsonSuccess } from '@/lib/http';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { listResellerRows } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    const rows = await listResellerRows(asDbClient(session.admin));
    const withEmail = await Promise.all(
      rows.map(async (row) => {
        const tenant = await session.admin.from('tenants').select('owner_user_id').eq('id', row.tenantId).maybeSingle();
        const ownerUserId = (tenant.data as { owner_user_id?: string } | null)?.owner_user_id;
        if (!ownerUserId) {
          return { ...row, email: row.email, joinedAt: row.joinedAt.toISOString() };
        }
        const { data } = await session.admin.auth.admin.getUserById(ownerUserId);
        return {
          ...row,
          email: data.user?.email ?? '',
          joinedAt: row.joinedAt.toISOString(),
        };
      }),
    );
    return jsonSuccess(withEmail);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
