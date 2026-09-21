/**
 * @file components/dashboard/owner-home.tsx
 *
 * Owner dashboard presentation: stat tiles, recent orders, and ring charts.
 * Receives already-fetched stats — no data loading here.
 *
 * @module Components
 */

import Link from 'next/link';
import { AlertTriangle, Package, ShoppingBag, Wallet } from 'lucide-react';
import { DonutChart } from '@/components/charts/DonutChart';
import { StatRing } from '@/components/charts/StatRing';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/stat-card';
import { ROUTES } from '@/lib/navigation';

export type OwnerRecentOrder = {
  readonly id: string;
  readonly productTitle: string;
  readonly customer: string;
  readonly amount: string;
  readonly method: string;
  readonly status: string;
};

export type OwnerHomeProps = {
  readonly revenueUsdt: string;
  readonly paidOrders: number;
  readonly pendingOrders: number;
  readonly productCount: number;
  readonly inStockCount: number;
  readonly lowStockCount: number;
  readonly activeResellers: number;
  readonly totalResellers: number;
  readonly completionPercent: number;
  readonly recentOrders: ReadonlyArray<OwnerRecentOrder>;
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

/**
 * Owner home layout matching the reference dashboard.
 *
 * @param props - Precomputed overview metrics
 */
export function OwnerHome({
  revenueUsdt,
  paidOrders,
  pendingOrders,
  productCount,
  inStockCount,
  lowStockCount,
  activeResellers,
  totalResellers,
  completionPercent,
  recentOrders,
}: OwnerHomeProps): JSX.Element {
  const resellerPercent = totalResellers === 0 ? 0 : Math.round((activeResellers / totalResellers) * 100);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={`${revenueUsdt} USDT`}
          trend="paid"
          icon={<Wallet size={16} />}
        />
        <StatCard
          label="Paid Orders"
          value={String(paidOrders)}
          trend={`${pendingOrders} pending`}
          icon={<ShoppingBag size={16} />}
        />
        <StatCard
          label="Products"
          value={String(productCount)}
          trend={`${inStockCount} in stock`}
          icon={<Package size={16} />}
        />
        <StatCard
          label="Low Stock"
          value={String(lowStockCount)}
          trend="≤2 units left"
          trendPositive={lowStockCount === 0}
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
            <p className="px-5 py-12 text-center text-sm text-[var(--text-2)]">No activity yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium text-[var(--text-2)]">Product</th>
                    <th className="px-4 py-3 text-xs font-medium text-[var(--text-2)]">Customer</th>
                    <th className="px-4 py-3 text-xs font-medium text-[var(--text-2)]">Amount</th>
                    <th className="px-4 py-3 text-xs font-medium text-[var(--text-2)]">Method</th>
                    <th className="px-4 py-3 text-xs font-medium text-[var(--text-2)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-t border-[var(--border)] hover:bg-[var(--bg-raised)]"
                    >
                      <td className="px-4 py-3 text-sm">
                        <Link
                          href={ROUTES.owner.orderDetail(order.id)}
                          className="text-[var(--text-1)] hover:text-[var(--accent-soft)]"
                        >
                          {order.productTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text-2)]">{order.customer}</td>
                      <td className="px-4 py-3 text-sm">{order.amount}</td>
                      <td className="px-4 py-3 text-sm text-[var(--text-2)]">{order.method}</td>
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
        <Card className="flex flex-col items-center justify-center">
          <h2 className="mb-4 self-start text-sm font-semibold text-[var(--text-1)]">Order completion</h2>
          <DonutChart
            value={completionPercent}
            total={`${completionPercent}%`}
            label="completed"
            color="var(--accent)"
          />
          <div className="mt-4 w-full space-y-1.5 text-xs text-[var(--text-2)]">
            <p className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Completed
            </p>
            <p className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--bg-overlay)]" /> Remaining
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex items-center gap-4">
          <StatRing value={resellerPercent} color="var(--green)" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">Resellers</p>
            <p className="text-xs text-[var(--text-2)]">{activeResellers} active</p>
          </div>
        </Card>
        <Card className="flex flex-col items-center">
          <h2 className="mb-3 self-start text-sm font-semibold text-[var(--text-1)]">Revenue mix</h2>
          <DonutChart
            value={paidOrders === 0 ? 0 : 100}
            total={`${revenueUsdt}`}
            label="USDT paid"
            color="var(--green)"
            size={100}
          />
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-1)]">Quick Actions</h2>
          <div className="flex flex-col gap-2">
            <Link href={ROUTES.owner.resellersInvite} className="btc-btn-primary w-full text-center text-xs">
              Invite reseller
            </Link>
            <Link href={ROUTES.owner.productNew} className="btc-btn-secondary w-full text-center text-xs">
              New product
            </Link>
            <Link
              href={ROUTES.owner.tokens}
              className="rounded-[var(--r-md)] px-3 py-1.5 text-center text-xs text-[var(--text-2)] hover:bg-[var(--bg-raised)] hover:text-[var(--text-1)]"
            >
              Issue tokens
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default OwnerHome;
