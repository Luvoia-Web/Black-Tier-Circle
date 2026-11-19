/**
 * @file app/api/platform/resellers/route.ts
 *
 * Owner-only reseller network summary and single-store inspection endpoint.
 */

import { z } from 'zod';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import {
  parseResellerRange,
  readResellerDetail,
  readResellersNetwork,
} from '@/modules/platform/resellers';

export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const db = asDbClient(session.admin);
    const url = new URL(request.url);
    const resellerId = url.searchParams.get('id');

    if (resellerId) {
      const validId = IdSchema.parse(resellerId);
      const tenantRow = await db.from('tenants').select('owner_user_id').eq('id', validId).maybeSingle();
      const ownerUserId =
        tenantRow.data && typeof tenantRow.data === 'object'
          ? (tenantRow.data as { readonly owner_user_id?: string }).owner_user_id
          : undefined;
      let ownerEmail: string | null = null;
      if (ownerUserId) {
        try {
          const authUser = await session.admin.auth.admin.getUserById(ownerUserId);
          ownerEmail = authUser.data?.user?.email ?? null;
        } catch {
          ownerEmail = null;
        }
      }
      const detail = await readResellerDetail(db, validId, ownerEmail);
      if (!detail) {
        throw new ValidationError('RESELLER_NOT_FOUND', 'That reseller store was not found.');
      }
      return jsonSuccess({ detail });
    }

    const payload = await readResellersNetwork(db, {
      range: parseResellerRange(url.searchParams.get('range')),
      q: url.searchParams.get('q') ?? '',
      status: url.searchParams.get('status') ?? 'all',
    });
    return jsonSuccess(payload);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
