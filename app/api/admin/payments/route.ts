/**
 * @file app/api/admin/payments/route.ts
 *
 * GET, owner only. Lists orders for the payment monitor.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { formatUsdt } from '@/lib/money';
import { getPaymentModeLabel, isPlatformPaymentConfigured } from '@/lib/payment-config';
import { getProduct } from '@/modules/catalog';
import { getPaymentStatus, listPaymentMonitorOrders } from '@/modules/payments';
import { getPlatformSettings } from '@/modules/platform';

export const dynamic = 'force-dynamic';

type Tab = 'pending' | 'verified' | 'failed' | 'all';

function asTab(value: string | null): Tab {
  if (value === 'pending' || value === 'verified' || value === 'failed' || value === 'all') {
    return value;
  }
  return 'pending';
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const tab = asTab(new URL(request.url).searchParams.get('tab'));
    const db = asDbClient(session.admin);
    const orders = await listPaymentMonitorOrders(db, tab);
    const rows = await Promise.all(
      orders.map(async (order) => {
        const product = await getProduct(db, order.productId);
        const status = await getPaymentStatus(db, order.id);
        return {
          orderId: order.id,
          channel: order.channel,
          productTitle: product.title,
          amount: formatUsdt(order.quotedRetailPriceMinor),
          method: status.paymentMethod,
          submittedAt: status.claim?.submittedAt.toISOString() ?? order.createdAt.toISOString(),
          paymentStatus: order.paymentStatus,
        };
      }),
    );
    const settings = await getPlatformSettings(db);
    const live = isPlatformPaymentConfigured(settings);
    return jsonSuccess({
      rows,
      modeLabel: getPaymentModeLabel(live),
      isDemoMode: !live,
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
