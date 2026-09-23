/**
 * @file app/(dashboard)/owner/page.tsx
 *
 * Owner dashboard home with live reseller, order, and revenue stats.
 *
 * @module Dashboard
 */

import { OwnerHome, type OwnerRecentOrder } from '@/components/dashboard/owner-home';
import { CronTriggerCard } from '@/components/ui/CronTriggerCard';
import { asDbClient } from '@/lib/auth/session';
import { formatUsdt } from '@/lib/money';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import { isPlatformPaymentConfigured } from '@/lib/payment-config';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SUPPLIER_CONFIG } from '@/lib/supplier-config';
import { listProducts } from '@/modules/catalog';
import { getProfile } from '@/modules/identity';
import { listOrders } from '@/modules/orders';
import { getPlatformSettings } from '@/modules/platform';
import { listTenants } from '@/modules/tenants';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Operations' };

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

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default async function OwnerDashboardPage(): Promise<JSX.Element> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    redirect(ROUTES.login);
  }
  const admin = createAdminSupabaseClient();
  const db = asDbClient(admin);
  const today = startOfToday();
  const [, publishedProducts, tenants, orders, settings, botsResult] = await Promise.all([
    getProfile(db, user.id),
    listProducts(db, { status: 'published' }),
    listTenants(db),
    listOrders(db, { limit: 200 }),
    getPlatformSettings(db),
    admin.from('bot_connections').select('id').eq('status', 'connected'),
  ]);
  const titleById = new Map(publishedProducts.map((product) => [product.id, product.title]));
  const tenantNameById = new Map(tenants.map((tenant) => [tenant.id, tenant.displayName]));
  const paidOrders = orders.filter((order) => isPaidOrder(order.paymentStatus, order.fulfillmentStatus));
  const pendingOrders = orders.filter((order) => isPendingOrder(order.paymentStatus));
  const completedCount = orders.filter((order) =>
    isCompletedOrder(order.fulfillmentStatus, order.deliveryStatus),
  ).length;
  const revenueMinor = paidOrders.reduce((sum, order) => sum + order.quotedWholesalePriceMinor, 0n);
  const todayOrders = orders.filter((order) => order.createdAt >= today);
  const paidToday = todayOrders.filter((order) => isPaidOrder(order.paymentStatus, order.fulfillmentStatus)).length;
  const fulfillingToday = todayOrders.filter(
    (order) =>
      order.fulfillmentStatus === 'queued' ||
      order.fulfillmentStatus === 'manual_pending' ||
      order.fulfillmentStatus === 'supplier_pending',
  ).length;
  const pendingActions = orders.filter(
    (order) =>
      order.fulfillmentStatus === 'manual_pending' ||
      order.paymentStatus === 'pending_verification' ||
      order.deliveryStatus === 'review_required',
  ).length;
  const recentOrders: ReadonlyArray<OwnerRecentOrder> = orders.slice(0, 10).map((order) => ({
    id: order.id,
    productTitle: titleById.get(order.productId) ?? order.productId.slice(0, 8).toUpperCase(),
    reseller: order.tenantId ? (tenantNameById.get(order.tenantId) ?? 'Reseller') : 'Owner store',
    amount: formatUsdt(order.quotedWholesalePriceMinor),
    method: order.paymentMethod ?? '—',
    status: order.paymentStatus,
    createdAt: order.createdAt.toISOString(),
  }));
  const resellerStats = new Map<string, { name: string; revenue: bigint; orders: number }>();
  for (const order of paidOrders) {
    if (!order.tenantId) {
      continue;
    }
    const current = resellerStats.get(order.tenantId) ?? {
      name: tenantNameById.get(order.tenantId) ?? 'Reseller',
      revenue: 0n,
      orders: 0,
    };
    current.revenue += order.quotedWholesalePriceMinor;
    current.orders += 1;
    resellerStats.set(order.tenantId, current);
  }
  const topResellers = [...resellerStats.values()]
    .sort((left, right) => (right.revenue > left.revenue ? 1 : -1))
    .slice(0, 5)
    .map((item) => ({ name: item.name, revenue: formatUsdt(item.revenue), orders: item.orders }));
  const productStats = new Map<string, number>();
  for (const order of orders) {
    productStats.set(order.productId, (productStats.get(order.productId) ?? 0) + 1);
  }
  const topProducts = [...productStats.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([id, count]) => ({
      title: titleById.get(id) ?? id.slice(0, 8).toUpperCase(),
      orders: count,
    }));
  const botsConnected = Array.isArray(botsResult.data) ? botsResult.data.length : 0;

  return (
    <>
      <OwnerHome
        revenueUsdt={formatUsdt(revenueMinor).replace(' USDT', '')}
        paidOrders={paidOrders.length}
        pendingOrders={pendingOrders.length}
        ordersToday={todayOrders.length}
        paidToday={paidToday}
        fulfillingToday={fulfillingToday}
        productCount={publishedProducts.length}
        inStockCount={publishedProducts.filter((product) => product.stockUnlimited || (product.stockCount ?? 0) > 0).length}
        lowStockCount={publishedProducts.filter((product) => isLowStock(product.stockUnlimited, product.stockCount)).length}
        activeResellers={tenants.filter((tenant) => tenant.status === 'active').length}
        pendingResellers={tenants.filter((tenant) => tenant.status === 'pending').length}
        totalResellers={tenants.length}
        pendingActions={pendingActions}
        completionPercent={orders.length === 0 ? 0 : Math.round((completedCount / orders.length) * 100)}
        paymentLive={isPlatformPaymentConfigured(settings)}
        supplierLive={SUPPLIER_CONFIG.activeSupplier !== 'sandbox'}
        botsConnected={botsConnected}
        recentOrders={recentOrders}
        topResellers={topResellers}
        topProducts={topProducts}
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
