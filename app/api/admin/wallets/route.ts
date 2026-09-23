/**
 * @file app/api/admin/wallets/route.ts
 *
 * GET, owner only. Lists all reseller wallets ordered by total balance descending.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listResellerWallets } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    const wallets = await listResellerWallets(asDbClient(session.admin));
    return jsonSuccess(wallets, 200, { cache: 'short' });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
