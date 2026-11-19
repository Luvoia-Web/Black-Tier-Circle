/**
 * @file app/api/platform/analytics/route.ts
 *
 * Dedicated read-only analytics endpoint for owner and reseller.
 * Tenant scope always resolves from the authenticated session.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, NotFoundError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { parseAnalyticsRange, readAnalytics } from '@/modules/platform/analytics';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to Analytics', 403);
    }
    const db = asDbClient(session.admin);
    let tenantId: string | null = null;
    if (role === 'reseller') {
      try {
        const tenant = await getTenantByUserId(db, session.user.id);
        tenantId = tenant.id;
      } catch (error: unknown) {
        if (!(error instanceof NotFoundError)) {
          throw error;
        }
        tenantId = null;
      }
    }
    const range = parseAnalyticsRange(new URL(request.url).searchParams.get('range'));
    const payload = await readAnalytics(db, { role, tenantId }, range);
    return jsonSuccess(payload, 200, { cache: 'none' });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
