/**
 * @file app/api/reseller/overview/route.ts
 *
 * GET reseller home stats for a dashboard period. tenant_id from session.
 *
 * Phase 9 auth audit: getUser() via requireReseller.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listProductsByIds } from '@/lib/lookups';
import { inPeriod, parseDashboardPeriod, periodRange } from '@/lib/period';
import { listOrders } from '@/modules/orders';
import { listResellerListings } from '@/modules/pricing';
import { getTenantSettings } from '@/modules/tenant-settings';
import { getWallet } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const period = parseDashboardPeriod(new URL(request.url).searchParams.get('period'));
    const range = periodRange(period);
    const db = asDbClient(session.admin);
    const [orders, listings, wallet, settings] = await Promise.all([
      listOrders(db, { tenantId: session.tenant.id, limit: 500 }),
      listResellerListings(db, session.tenant.id),
      getWallet(db, session.tenant.id),
      getTenantSettings(db, session.tenant.id),
    ]);
    const inRange = orders.filter((order) => inPeriod(order.createdAt, range));
    const paid = inRange.filter(
      (order) => order.paymentStatus === 'verified' || order.fulfillmentStatus === 'ready',
    );
    const pendingCount = inRange.filter(
      (order) => order.paymentStatus === 'awaiting' || order.paymentStatus === 'pending_verification',
    ).length;
    const revenueMinor = paid.reduce((sum, order) => sum + order.quotedRetailPriceMinor, 0n);
    const recentSlice = inRange.slice(0, 8);
    const products = await listProductsByIds(
      db,
      recentSlice.map((order) => order.productId),
    );
    const recent = recentSlice.map((order) => ({
      id: order.id,
      productTitle: products.get(order.productId)?.title ?? order.productId.slice(0, 8).toUpperCase(),
      total: order.quotedRetailPriceMinor.toString(),
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt.toISOString(),
    }));
    return jsonSuccess(
      {
        period,
        storeName: settings.storeName ?? session.tenant.displayName,
        tenantStatus: session.tenant.status,
        profileStatus: session.profile.status,
        stats: {
          revenueMinor: revenueMinor.toString(),
          paidOrders: paid.length,
          pendingOrders: pendingCount,
          productsListed: listings.filter((item) => item.isVisible).length,
          walletAvailableMinor: wallet.balanceAvailable.toString(),
        },
        recent,
      },
      200,
      { cache: 'short' },
    );
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
