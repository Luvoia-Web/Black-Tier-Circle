/**
 * @file app/api/admin/payments/route.ts
 *
 * GET, owner only. Lists orders for the payment monitor.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listProductsByIds } from '@/lib/lookups';
import { formatUsdt } from '@/lib/money';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getPaymentModeLabel, isPlatformPaymentConfigured } from '@/lib/payment-config';
import { listPaymentMonitorOrders } from '@/modules/payments';
import { mapPaymentClaimRow } from '@/modules/payments/map';
import type { PaymentClaimRow } from '@/modules/payments/types';
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
    const [orders, settings] = await Promise.all([
      listPaymentMonitorOrders(db, tab),
      getPlatformSettings(db),
    ]);
    const [products, claimsByOrder] = await Promise.all([
      listProductsByIds(
        db,
        orders.map((order) => order.productId),
      ),
      listLatestClaimsByOrder(
        db,
        orders.map((order) => order.id),
      ),
    ]);
    const rows = orders.map((order) => {
      const claim = claimsByOrder.get(order.id);
      return {
        orderId: order.id,
        channel: order.channel,
        productTitle: products.get(order.productId)?.title ?? order.productId.slice(0, 8).toUpperCase(),
        amount: formatUsdt(order.quotedRetailPriceMinor),
        method: claim?.paymentMethod ?? order.paymentMethod,
        submittedAt: claim?.submittedAt.toISOString() ?? order.createdAt.toISOString(),
        paymentStatus: order.paymentStatus,
      };
    });
    const live = isPlatformPaymentConfigured(settings);
    return jsonSuccess(
      {
        rows,
        modeLabel: getPaymentModeLabel(live),
        isDemoMode: !live,
      },
      200,
      { cache: 'short' },
    );
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

async function listLatestClaimsByOrder(supabase: DbClient, orderIds: ReadonlyArray<string>) {
  const unique = [...new Set(orderIds.filter((id) => id.length > 0))];
  const map = new Map<string, ReturnType<typeof mapPaymentClaimRow>>();
  if (unique.length === 0) {
    return map;
  }
  const result = (await supabase
    .from('payment_claims')
    .select('id, order_id, payment_method, binance_order_id, tx_hash, submitted_at, verified_at, rejected_at, reject_reason, verification_evidence')
    .in('order_id', unique)
    .order('submitted_at', { ascending: false })) as QueryResult<unknown[] | null>;
  for (const raw of Array.isArray(result.data) ? result.data : []) {
    const claim = mapPaymentClaimRow(raw as PaymentClaimRow);
    if (!map.has(claim.orderId)) {
      map.set(claim.orderId, claim);
    }
  }
  return map;
}
