/**
 * @file app/api/reseller/bills/route.ts
 *
 * GET wholesale amounts the reseller owes the owner for sales.
 *
 * Phase 9 auth audit: getUser() via requireReseller.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { formatUsdt } from '@/lib/money';
import { getProduct } from '@/modules/catalog';
import { listOrders } from '@/modules/orders';
import { getWallet } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

function isUnfunded(order: {
  readonly fundingStatus: string;
  readonly paymentStatus: string;
}): boolean {
  return (
    order.fundingStatus === 'reserved' ||
    (order.paymentStatus === 'verified' && order.fundingStatus === 'not_applicable')
  );
}

export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    const db = asDbClient(session.admin);
    const [wallet, orders] = await Promise.all([
      getWallet(db, session.tenant.id),
      listOrders(db, { tenantId: session.tenant.id, limit: 500 }),
    ]);
    const rows = await Promise.all(
      orders.map(async (order) => {
        const product = await getProduct(db, order.productId);
        const unfunded = isUnfunded(order);
        return {
          orderId: order.id,
          productTitle: product.title,
          quantity: 1,
          date: order.createdAt.toISOString(),
          sold: formatUsdt(order.quotedRetailPriceMinor),
          owed: formatUsdt(unfunded ? order.quotedWholesalePriceMinor : 0n),
          unfunded,
        };
      }),
    );
    const unpaidMinor = orders
      .filter((order) => isUnfunded(order))
      .reduce((sum, order) => sum + order.quotedWholesalePriceMinor, 0n);
    return jsonSuccess({
      depositBalance: formatUsdt(wallet.balanceAvailable),
      unpaidToAdmin: formatUsdt(unpaidMinor),
      rows,
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
