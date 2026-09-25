/**
 * @file app/api/admin/wallets/route.ts
 *
 * GET, owner only. Lists all reseller wallets ordered by total balance descending.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listOrders } from '@/modules/orders';
import { listResellerWallets } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    const db = asDbClient(session.admin);
    const wallets = await listResellerWallets(db);
    const orders = await listOrders(db, { limit: 300 });
    const own = orders.filter((order) => order.channel === 'owner_store' || order.tenantId === null);
    const paid = own.filter((order) => order.paymentStatus === 'verified');
    const pending = own.filter(
      (order) => order.paymentStatus === 'awaiting' || order.paymentStatus === 'pending_verification',
    );
    const sum = (rows: typeof own): string =>
      rows.reduce((total, order) => total + order.quotedWholesalePriceMinor, 0n).toString();
    return jsonSuccess(
      {
        wallets,
        owner: {
          totalMinor: sum(paid),
          availableMinor: sum(paid),
          reservedMinor: sum(pending),
          recent: paid.slice(0, 5).map((order) => ({
            id: order.id,
            amountMinor: order.quotedWholesalePriceMinor.toString(),
            createdAt: order.createdAt.toISOString(),
          })),
        },
      },
      200,
      { cache: 'short' },
    );
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
