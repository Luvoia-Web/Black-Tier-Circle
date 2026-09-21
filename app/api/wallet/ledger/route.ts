/**
 * @file app/api/wallet/ledger/route.ts
 *
 * GET, reseller only. Paginated ledger for the session tenant wallet.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { getLedgerEntries, getWallet } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const url = new URL(request.url);
    const pageParam = url.searchParams.get('page');
    const limitParam = url.searchParams.get('limit');
    const sinceParam = url.searchParams.get('since');
    const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(limitParam ?? '20', 10) || 20));
    const since = sinceParam ? new Date(sinceParam) : undefined;

    const wallet = await getWallet(asDbClient(session.admin), session.tenant.id);
    const entries = await getLedgerEntries(asDbClient(session.admin), wallet.id, {
      limit,
      offset: (page - 1) * limit,
      ...(since !== undefined && !Number.isNaN(since.getTime()) ? { since } : {}),
    });

    return jsonSuccess({
      page,
      limit,
      entries,
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
