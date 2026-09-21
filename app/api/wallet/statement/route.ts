/**
 * @file app/api/wallet/statement/route.ts
 *
 * GET, reseller only. Wallet statement for a date range (defaults to last 30 days).
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { getWallet, getWalletStatement } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const url = new URL(request.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const periodEnd = toParam ? new Date(toParam) : new Date();
    const periodStart = fromParam ? new Date(fromParam) : new Date(periodEnd.getTime() - THIRTY_DAYS_MS);

    const wallet = await getWallet(asDbClient(session.admin), session.tenant.id);
    const statement = await getWalletStatement(
      asDbClient(session.admin),
      wallet.id,
      periodStart,
      periodEnd,
    );
    return jsonSuccess(statement);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
