/**
 * @file components/dashboard/owner-home.tsx
 *
 * Owner operations center: stats, recent orders, health, and rankings.
 *
 * @module Components
 */

import Link from 'next/link';
import { AlertTriangle, KeyRound, Package, Settings, ShoppingBag, Users, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatCard } from '@/components/ui/stat-card';
import { formatRelativeTime } from '@/lib/relative-time';
import { ROUTES } from '@/lib/navigation';

export type OwnerRecentOrder = {
  readonly id: string;
  readonly productTitle: string;
  readonly reseller: string;
  readonly amount: string;
  readonly method: string;
  readonly status: string;
  readonly createdAt: string;
};

export type OwnerHomeProps = {
  readonly revenueUsdt: string;
  readonly paidOrders: number;
  readonly pendingOrders: number;
  readonly ordersToday: number;
  readonly paidToday: number;
  readonly fulfillingToday: number;
  readonly productCount: number;
  readonly inStockCount: number;
  readonly lowStockCount: number;
  readonly activeResellers: number;
  readonly pendingResellers: number;
  readonly totalResellers: number;
  readonly pendingActions: number;
  readonly completionPercent: number;
  readonly paymentLive: boolean;
  readonly supplierLive: boolean;
  readonly botsConnected: number;
  readonly recentOrders: ReadonlyArray<OwnerRecentOrder>;
  readonly topResellers: ReadonlyArray<{ readonly name: string; readonly revenue: string; readonly orders: number }>;
  readonly topProducts: ReadonlyArray<{ readonly title: string; readonly orders: number }>;
};

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'verified' || status === 'ready' || status === 'paid') {
    return 'success';
  }
  if (status === 'failed' || status === 'canceled' || status === 'expired') {
    return 'danger';
  }
  if (status === 'awaiting' || status === 'pending_verification' || status === 'queued') {
    return 'warning';
  }
  return 'neutral';
}

export function OwnerHome({
  revenueUsdt,
  paidOrders,
  pendingOrders,
  ordersToday,
  paidToday,
  fulfillingToday,
  productCount,
  lowStockCount,
  activeResellers,
  pendingResellers,
  pendingActions,
  paymentLive,
  supplierLive,
  botsConnected,
  recentOrders,
  topResellers,
  topProducts,
}: OwnerHomeProps): JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base font-semibold text-[var(--text-1)]">Operations</h1>
        <p className="mt-1 text-sm text-[var(--text-2)]">Platform overview</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={`${revenueUsdt} USDT`} trend={`${paidOrders} paid orders`} icon={<Wallet size={16} />} />
        <StatCard
          label="Active Resellers"
          value={String(activeResellers)}
          trend={`${pendingResellers} pending approval`}
          icon={<Users size={16} />}
        />
        <StatCard
          label="Orders Today"
          value={String(ordersToday)}
          trend={`${paidToday} paid · ${fulfillingToday} fulfilling`}
          icon={<ShoppingBag size={16} />}
        />
        <StatCard
          label="Pending Actions"
          value={String(pendingActions)}
          trend={pendingActions === 0 ? 'all clear' : 'needs attention'}
          trendPositive={pendingActions === 0}
          icon={<AlertTriangle size={16} />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" padding="p-0">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Recent Orders</h2>
            <Link href={ROUTES.owner.orders} className="text-xs text-[var(--accent-soft)] hover:text-[var(--accent)]">
              View all
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <EmptyState
              icon="📭"
              title="No orders yet"
              description="Orders from owner and reseller bots will appear here."
              action={{ label: 'Add Product', href: ROUTES.owner.productNew }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium text-[var(--text-2)]">Time</th>
                    <th className="px-4 py-3 text-xs font-medium text-[var(--text-2)]">Product</th>
                    <th className="px-4 py-3 text-xs font-medium text-[var(--text-2)]">Reseller</th>
                    <th className="px-4 py-3 text-xs font-medium text-[var(--text-2)]">Amount</th>
                    <th className="px-4 py-3 text-xs font-medium text-[var(--text-2)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-raised)]">
                      <td className="px-4 py-3 text-xs text-[var(--text-3)]">{formatRelativeTime(order.createdAt)}</td>
                      <td className="px-4 py-3 text-sm">
                        <Link href={ROUTES.owner.orderDetail(order.id)} className="text-[var(--text-1)] hover:text-[var(--accent-soft)]">
                          {order.productTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text-2)]">{order.reseller}</td>
                      <td className="px-4 py-3 text-sm">{order.amount}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(order.status)}>{order.status.replaceAll('_', ' ')}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Platform Health</h2>
            <ul className="space-y-2 text-sm text-[var(--text-2)]">
              <li className="flex justify-between">
                <span>Payment mode</span>
                <span>{paymentLive ? '🟢 Live' : '🟡 Demo'}</span>
              </li>
              <li className="flex justify-between">
                <span>Supplier mode</span>
                <span>{supplierLive ? '🟢 Live' : '🟡 Demo'}</span>
              </li>
              <li className="flex justify-between">
                <span>Bots connected</span>
                <span className="text-[var(--text-1)]">{botsConnected}</span>
              </li>
              <li className="flex justify-between">
                <span>Active products</span>
                <span className="text-[var(--text-1)]">{productCount}</span>
              </li>
              <li className="flex justify-between">
                <span>Low stock</span>
                <span className="text-[var(--text-1)]">{lowStockCount}</span>
              </li>
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              <Link href={ROUTES.owner.productNew} className="btc-btn-primary text-center text-xs">
                <Package size={12} className="mr-1 inline" /> Add Product
              </Link>
              <Link href={ROUTES.owner.resellersInvite} className="btc-btn-secondary text-center text-xs">
                <Users size={12} className="mr-1 inline" /> Invite
              </Link>
              <Link href={ROUTES.owner.tokens} className="btc-btn-secondary text-center text-xs">
                <KeyRound size={12} className="mr-1 inline" /> Token
              </Link>
              <Link href={ROUTES.owner.settings} className="btc-btn-secondary text-center text-xs">
                <Settings size={12} className="mr-1 inline" /> Settings
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Revenue by Reseller</h2>
          {topResellers.length === 0 ? (
            <p className="text-sm text-[var(--text-3)]">No reseller sales in this snapshot.</p>
          ) : (
            <ul className="space-y-2">
              {topResellers.map((item) => (
                <li key={item.name} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-1)]">{item.name}</span>
                  <span className="text-[var(--text-2)]">
                    {item.revenue} · {item.orders}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Top Products</h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-[var(--text-3)]">No product volume yet.</p>
          ) : (
            <ul className="space-y-2">
              {topProducts.map((item) => (
                <li key={item.title} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-1)]">{item.title}</span>
                  <span className="text-[var(--text-2)]">{item.orders} orders</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export default OwnerHome;
