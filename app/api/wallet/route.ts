/**
 * @file app/api/wallet/route.ts
 *
 * GET, reseller only. Returns the session tenant's wallet balances as strings.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { getWallet } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    const wallet = await getWallet(asDbClient(session.admin), session.tenant.id);
    return jsonSuccess(
      {
        balanceTotal: wallet.balanceTotal,
        balanceReserved: wallet.balanceReserved,
        balanceAvailable: wallet.balanceAvailable,
      },
      200,
      { cache: 'none' },
    );
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
