/**
 * @file app/api/admin/wallets/[walletId]/route.ts
 *
 * GET, owner only. Wallet summary and paginated ledger for a reseller wallet.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { getLedgerEntries, getWalletById } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly walletId: string };
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const url = new URL(request.url);
    const pageParam = url.searchParams.get('page');
    const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
    const limit = 20;
    const db = asDbClient(session.admin);
    const wallet = await getWalletById(db, context.params.walletId);
    const entries = await getLedgerEntries(db, wallet.id, {
      limit,
      offset: (page - 1) * limit,
    });
    return jsonSuccess({ wallet, entries, page, limit });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
