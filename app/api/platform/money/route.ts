/**
 * @file app/api/platform/money/route.ts
 *
 * Wallets, filtered ledger, CSV export, and wholesale debts.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { moneyCsv, readMoney } from '@/modules/platform/money';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to money', 403);
    }
    const db = asDbClient(session.admin);
    const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind') ?? '';
    const walletId = url.searchParams.get('wallet') ?? '';
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    const q = url.searchParams.get('q') ?? '';
    const payload = await readMoney(
      db,
      { role, tenantId: tenant?.id ?? null },
      {
        ...(kind ? { kind } : {}),
        ...(walletId ? { walletId } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(q ? { q } : {}),
      },
    );
    if (url.searchParams.get('format') === 'csv') {
      return new Response(moneyCsv(payload), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="ledger.csv"',
        },
      });
    }
    return jsonSuccess(payload);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
