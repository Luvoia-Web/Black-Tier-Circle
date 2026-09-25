/**
 * @file app/(dashboard)/reseller/page.tsx
 *
 * Reseller dashboard home: period stats, recent orders, and wallet ring.
 *
 * @module Dashboard
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Package, ShoppingBag, Wallet } from 'lucide-react';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { LivePulse } from '@/components/dashboard/LivePulse';
import { DocumentTitle } from '@/components/ui/DocumentTitle';
import { DonutChart } from '@/components/charts/DonutChart';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState, SkeletonPage } from '@/components/ui/fetch-states';
import { PeriodPills } from '@/components/ui/period-pills';
import { StatCard } from '@/components/ui/stat-card';
import { formatRelativeTime } from '@/lib/relative-time';
import { formatUsdt } from '@/lib/money';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { DashboardPeriod } from '@/lib/period';

type Overview = {
  readonly period: DashboardPeriod;
  readonly storeName: string;
  readonly profileStatus: string;
  readonly tenantStatus?: string;
  readonly stats: {
    readonly revenueMinor: string;
    readonly paidOrders: number;
    readonly pendingOrders: number;
    readonly productsListed: number;
    readonly walletAvailableMinor: string;
  };
  readonly recent: ReadonlyArray<{
    readonly id: string;
    readonly productTitle: string;
    readonly total: string;
    readonly paymentStatus: string;
    readonly createdAt: string;
  }>;
};

export default function ResellerDashboardPage(): JSX.Element {
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_ROUTES.resellerOverview}?period=${period}`);
      const json = (await response.json()) as {
        success: boolean;
        data?: Overview;
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load dashboard');
        return;
      }
      setData(json.data);
      setStoreName(json.data.storeName);
    } catch {
      setError('Unable to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveName(): Promise<void> {
    setSavingName(true);
    try {
      await fetch(API_ROUTES.resellerSettings, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeName }),
      });
      toast.success('Store name saved');
      await load();
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div className="space-y-6">
      <DocumentTitle title="Dashboard — Black Tier Circle" />
      <DashboardHero subtitle="Your store, orders, and wallet in one place" />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={storeName}
            onChange={(event) => setStoreName(event.target.value)}
            className="btc-input max-w-xs text-base font-semibold"
            aria-label="Store name"
          />
          <button
            type="button"
            onClick={() => void saveName()}
            disabled={savingName}
            className="btc-btn-secondary"
          >
            {savingName ? 'Saving…' : 'Save name'}
          </button>
        </div>
        <PeriodPills value={period} onChange={setPeriod} />
      </div>
      {data?.profileStatus === 'pending' || data?.tenantStatus === 'pending' ? (
        <div className="rounded-[var(--r-md)] border border-[var(--amber)]/20 bg-[var(--amber-soft)] px-4 py-3 text-sm text-[var(--amber)]">
          Account pending owner activation. Contact support.
        </div>
      ) : null}
      {data?.tenantStatus === 'suspended' ? (
        <div className="rounded-[var(--r-md)] border border-[var(--red)]/20 bg-[var(--red-soft)] px-4 py-3 text-sm text-[var(--red)]">
          Account suspended. Contact platform support.
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading || !data ? loading ? <SkeletonPage /> : null : <ResellerDashboardBody data={data} />}
    </div>
  );
}

function ResellerDashboardBody({ data }: { readonly data: Overview }): JSX.Element {
  const available = formatUsdt(BigInt(data.stats.walletAvailableMinor));
  return (
    <>
      <LivePulse href="/api/reseller/orders?period=month&pageSize=50" title="Your store this month" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue (paid)"
          value={formatUsdt(BigInt(data.stats.revenueMinor))}
          icon={<Wallet size={16} />}
        />
        <StatCard
          label="Paid Orders"
          value={String(data.stats.paidOrders)}
          trend={`${data.stats.pendingOrders} pending`}
          icon={<ShoppingBag size={16} />}
        />
        <StatCard
          label="Products Listed"
          value={String(data.stats.productsListed)}
          icon={<Package size={16} />}
        />
        <StatCard
          label="Wallet Balance"
          value={available}
          trend="Available USDT (current)"
          icon={<Wallet size={16} />}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" padding="p-0">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-sm font-semibold">Recent orders</h2>
          </div>
          {data.recent.length === 0 ? (
            <EmptyState
              icon="📭"
              title="No orders yet"
              description="Orders will appear here when customers buy from your bot."
              action={{ label: 'Configure Bot', href: ROUTES.reseller.bot }}
            />
          ) : (
            <ul>
              {data.recent.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3 last:border-0 hover:bg-[var(--bg-raised)]"
                >
                  <div>
                    <Link
                      href={ROUTES.reseller.orderDetail(row.id)}
                      className="text-sm text-[var(--accent-soft)] hover:text-[var(--accent)]"
                    >
                      {row.productTitle}
                    </Link>
                    <p className="text-xs text-[var(--text-3)]">{formatRelativeTime(row.createdAt)}</p>
                  </div>
                  <span className="text-sm">{formatUsdt(BigInt(row.total))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="flex flex-col items-center">
          <h2 className="mb-4 self-start text-sm font-semibold">Wallet</h2>
          <DonutChart
            value={100}
            total={available.replace(' USDT', '')}
            label="USDT available"
            color="var(--green)"
            segments={[{ value: 100, color: 'var(--green)', label: 'Available' }]}
          />
          <div className="mt-4 w-full space-y-1.5 text-xs text-[var(--text-2)]">
            <p className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[var(--green)]" /> Available
              </span>
              <span>{available}</span>
            </p>
          </div>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={ROUTES.reseller.products} className="btc-btn-primary text-xs">
          Add Products
        </Link>
        <Link href={ROUTES.reseller.deposits} className="btc-btn-secondary text-xs">
          Deposit Funds
        </Link>
        <Link href={ROUTES.reseller.bot} className="btc-btn-secondary text-xs">
          Configure Bot
        </Link>
      </div>
    </>
  );
}
