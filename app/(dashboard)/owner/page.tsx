/**
 * @file app/(dashboard)/owner/page.tsx
 *
 * Owner dashboard home with live reseller, order, and revenue stats.
 *
 * @module Dashboard
 */

import { OwnerHome, type OwnerRecentOrder } from '@/components/dashboard/owner-home';
import { CronTriggerCard } from '@/components/ui/CronTriggerCard';
import { formatUsdt } from '@/lib/money';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { asDbClient } from '@/lib/auth/session';
import { listProducts } from '@/modules/catalog';
import { getProfile } from '@/modules/identity';
import { listOrders } from '@/modules/orders';
import { listTenants } from '@/modules/tenants';
import { redirect } from 'next/navigation';

function isPaidOrder(paymentStatus: string, fulfillmentStatus: string): boolean {
  return paymentStatus === 'verified' || fulfillmentStatus === 'ready';
}

function isPendingOrder(paymentStatus: string): boolean {
  return paymentStatus === 'awaiting' || paymentStatus === 'pending_verification';
}

function isLowStock(stockUnlimited: boolean, stockCount: number | null): boolean {
  return !stockUnlimited && stockCount !== null && stockCount <= 2;
}

function isCompletedOrder(fulfillmentStatus: string, deliveryStatus: string): boolean {
  return fulfillmentStatus === 'ready' && deliveryStatus === 'sent';
}

export default async function OwnerDashboardPage(): Promise<JSX.Element> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    redirect(ROUTES.login);
  }
  const db = asDbClient(createAdminSupabaseClient());
  await getProfile(db, user.id);
  const publishedProducts = await listProducts(db, { status: 'published' });
  const tenants = await listTenants(db);
  const orders = await listOrders(db, { limit: 200 });
  const titleById = new Map(publishedProducts.map((product) => [product.id, product.title]));
  const paidOrders = orders.filter((order) => isPaidOrder(order.paymentStatus, order.fulfillmentStatus));
  const pendingOrders = orders.filter((order) => isPendingOrder(order.paymentStatus));
  const completedCount = orders.filter((order) =>
    isCompletedOrder(order.fulfillmentStatus, order.deliveryStatus),
  ).length;
  const revenueMinor = paidOrders.reduce((sum, order) => sum + order.quotedWholesalePriceMinor, 0n);
  const recentOrders: ReadonlyArray<OwnerRecentOrder> = orders.slice(0, 8).map((order) => ({
    id: order.id,
    productTitle: titleById.get(order.productId) ?? order.productId.slice(0, 8).toUpperCase(),
    customer: order.customerId ? order.customerId.slice(0, 8) : 'Direct',
    amount: formatUsdt(order.quotedWholesalePriceMinor),
    method: order.paymentMethod ?? '—',
    status: order.paymentStatus,
  }));

  return (
    <>
      <OwnerHome
        revenueUsdt={formatUsdt(revenueMinor).replace(' USDT', '')}
        paidOrders={paidOrders.length}
        pendingOrders={pendingOrders.length}
        productCount={publishedProducts.length}
        inStockCount={publishedProducts.filter((product) => product.stockUnlimited || (product.stockCount ?? 0) > 0).length}
        lowStockCount={publishedProducts.filter((product) => isLowStock(product.stockUnlimited, product.stockCount)).length}
        activeResellers={tenants.filter((tenant) => tenant.status === 'active').length}
        totalResellers={tenants.length}
        completionPercent={orders.length === 0 ? 0 : Math.round((completedCount / orders.length) * 100)}
        recentOrders={recentOrders}
      />
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-[var(--text-2)]">System Jobs</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CronTriggerCard
            title="Process Orders"
            description="Fulfills all queued orders that have been paid"
            endpoint={API_ROUTES.fulfillmentProcess}
            icon="⚡"
          />
          <CronTriggerCard
            title="Reconcile Supplier"
            description="Checks status of pending supplier orders"
            endpoint={API_ROUTES.supplierReconcile}
            icon="🔄"
          />
          <CronTriggerCard
            title="Bot Health Check"
            description="Verifies all connected Telegram bots are active"
            endpoint={API_ROUTES.botsHealth}
            icon="🤖"
          />
        </div>
      </div>
    </>
  );
}
