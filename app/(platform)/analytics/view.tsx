'use client';

/**
 * Analytics view. Full revenue, order volume, funnel, channel/payment mix,
 * top products, and (for owner) top resellers across the selected range.
 */

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Receipt, Repeat, ShoppingBag, Timer, TrendingUp } from 'lucide-react';
import {
  AreaTrend,
  BarTrend,
  CHART_COLORS,
  DonutShare,
  RankedBars,
  StageBars,
} from '@/components/platform/ui/charts';
import { DeltaPill, EmptyState, ErrorState, Skeleton, StatTile } from '@/components/platform/ui';
import { useData } from '@/lib/hooks/use-data';
import { ROUTES } from '@/lib/navigation';
import type { AnalyticsPayload } from '@/modules/platform/analytics';
import type { OverviewRange } from '@/modules/platform/overview';

const RANGES: readonly { readonly id: OverviewRange; readonly label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '12m', label: '12 months' },
];

const KPI_ICONS = {
  revenue: { icon: TrendingUp, tone: 'rose' as const },
  orders: { icon: ShoppingBag, tone: 'sky' as const },
  average: { icon: Receipt, tone: 'amber' as const },
  delivery: { icon: CheckCircle2, tone: 'mint' as const },
  conversion: { icon: Timer, tone: 'sky' as const },
  repeat: { icon: Repeat, tone: 'rose' as const },
} as const;

export function AnalyticsView(): JSX.Element {
  const [range, setRange] = useState<OverviewRange>('7d');
  const state = useData<AnalyticsPayload>(`/api/platform/analytics?range=${range}`);
  const data = state.data;

  const isQuiet = data ? data.ordersSummary.total === 0 : false;
  const startCount = data?.funnel[0]?.value ?? 0;
  const paidCount = data?.funnel[1]?.value ?? 0;
  const deliveredCount = data?.funnel[3]?.value ?? 0;
  const paidRate = startCount > 0 ? Math.round((paidCount / startCount) * 100) : 0;
  const deliveredRate = paidCount > 0 ? Math.round((deliveredCount / paidCount) * 100) : 0;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-medium tracking-tight text-ink">Analytics</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {data?.role === 'reseller'
              ? 'Revenue by channel, order volume, conversion funnel, and top products for your store.'
              : 'Revenue by channel, order volume, conversion funnel, and top performers.'}
          </p>
        </div>
        <div className="inline-flex flex-wrap rounded-xl border border-white/10 bg-black/25 p-1" role="tablist" aria-label="Range">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={range === item.id}
              className={`h-8 rounded-lg px-3 text-[12.5px] transition ${
                range === item.id ? 'bg-white/12 text-ink' : 'text-ink-faint hover:text-ink-soft'
              }`}
              onClick={() => setRange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {state.loading && !data ? (
        <div className="space-y-4" aria-label="Loading analytics">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="glass-card rounded-lg p-4 space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
          <div className="glass-card rounded-lg p-4 space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-56 w-full" />
          </div>
        </div>
      ) : null}

      {state.error && !data ? (
        <ErrorState
          message={state.error.message}
          requestId={state.error.requestId}
          detail={state.error.detail}
          onRetry={state.refetch}
        />
      ) : null}

      {data && isQuiet ? (
        <EmptyState
          title="No sales in this range"
          message="Publish a product and take an order to fill out the charts for this window."
          action={
            <Link href={ROUTES.platform.catalog} className="btc-btn-primary">
              Open products
            </Link>
          }
        />
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
            {data.kpis.map((kpi) => {
              const meta = KPI_ICONS[kpi.id as keyof typeof KPI_ICONS] ?? KPI_ICONS.revenue;
              return (
                <StatTile
                  key={kpi.id}
                  label={kpi.label}
                  value={kpi.value}
                  hint={kpi.hint}
                  icon={meta.icon}
                  tone={kpi.tone === 'down' ? 'danger' : meta.tone}
                  {...(kpi.delta ? { delta: kpi.delta, deltaTone: kpi.tone } : {})}
                />
              );
            })}
          </div>

          <article className="glass-card min-w-0 rounded-lg p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm text-ink">Revenue by channel</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="font-num text-2xl text-ink">{data.revenue}</p>
                  <DeltaPill tone={data.deltaPercent > 0 ? 'up' : data.deltaPercent < 0 ? 'down' : 'flat'}>
                    {data.deltaPercent > 0 ? '+' : ''}
                    {data.deltaPercent}% vs prior
                  </DeltaPill>
                </div>
              </div>
              <p className="text-xs text-ink-faint">{data.rangeLabel}</p>
            </div>
            <div className="mt-3 min-w-0">
              <AreaTrend
                data={data.revenueSeries}
                valueFormatter={(val) => `${val.toFixed(2)} USDT`}
                series={
                  data.role === 'owner'
                    ? [
                        { key: 'owner', label: 'Owner store', color: CHART_COLORS.rose, value: data.revenueLegend.owner },
                        { key: 'reseller', label: 'Reseller stores', color: CHART_COLORS.amber, value: data.revenueLegend.reseller },
                        { key: 'api', label: 'API', color: CHART_COLORS.sky, value: data.revenueLegend.api },
                      ]
                    : [
                        { key: 'reseller', label: 'Your store', color: CHART_COLORS.rose, value: data.revenueLegend.reseller },
                        { key: 'api', label: 'API', color: CHART_COLORS.sky, value: data.revenueLegend.api },
                      ]
                }
              />
            </div>
          </article>

          <div className="grid gap-3 lg:grid-cols-2">
            <article className="glass-card min-w-0 rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm text-ink">Orders over time</h2>
                <p className="font-num text-xs text-ink-faint">
                  {data.ordersSummary.paid} paid · {data.ordersSummary.delivered} delivered
                </p>
              </div>
              <div className="mt-3 min-w-0">
                <BarTrend
                  data={data.ordersSeries}
                  stacked
                  series={[
                    { key: 'delivered', label: 'Delivered', color: CHART_COLORS.mint, value: String(data.ordersSummary.delivered) },
                    { key: 'attention', label: 'Needs attention', color: CHART_COLORS.amber, value: String(data.ordersSummary.attention) },
                    { key: 'unpaid', label: 'Awaiting payment', color: CHART_COLORS.sky, value: String(data.ordersSummary.unpaid) },
                  ]}
                />
              </div>
            </article>

            <article className="glass-card min-w-0 rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm text-ink">Order funnel</h2>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-pill border border-stroke px-2 py-0.5 text-ink-soft">
                    Start → Paid <strong className="font-num text-ink">{paidRate}%</strong>
                  </span>
                  <span className="rounded-pill border border-stroke px-2 py-0.5 text-ink-soft">
                    Paid → Delivered <strong className="font-num text-ink">{deliveredRate}%</strong>
                  </span>
                </div>
              </div>
              {data.ordersSummary.total === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">No orders have moved through the funnel in this range.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  <StageBars stages={data.funnel.map((stage) => ({ label: stage.label, value: stage.value, color: stage.color }))} />
                  <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
                    {data.funnel.map((stage) => (
                      <div key={stage.label} className="rounded-md bg-white/[0.03] px-2.5 py-2">
                        <p className="truncate text-[11px] text-ink-faint">{stage.label}</p>
                        <p className="mt-0.5 font-num text-sm text-ink">
                          {stage.value} <span className="text-xs text-ink-soft">({stage.rate})</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <article className="glass-card min-w-0 rounded-lg p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm text-ink">Top products</h2>
                <span className="text-xs text-ink-faint">{data.rangeLabel}</span>
              </div>
              <RankedBars
                empty="No product has sold in this range."
                items={data.topProducts.map((product, index) => ({
                  id: product.id,
                  rank: index + 1,
                  label: product.name,
                  sublabel: `${product.units} units · ${product.orders} orders`,
                  value: product.revenueUsdt,
                  primaryText: product.revenue,
                  secondaryText: `${product.sharePercent}% share`,
                  href: ROUTES.platform.catalog,
                }))}
              />
            </article>

            {data.role === 'owner' ? (
              <article className="glass-card min-w-0 rounded-lg p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm text-ink">Top resellers</h2>
                  <span className="text-xs text-ink-faint">{data.rangeLabel}</span>
                </div>
                <RankedBars
                  empty="No reseller has sold in this range."
                  items={data.topResellers.map((reseller, index) => ({
                    id: reseller.id,
                    rank: index + 1,
                    label: reseller.name,
                    ...(reseller.handle ? { sublabel: reseller.handle } : {}),
                    value: reseller.revenueUsdt,
                    primaryText: reseller.revenue,
                    secondaryText: `${reseller.orders} orders`,
                    href: `${ROUTES.platform.resellers}?store=${encodeURIComponent(reseller.id)}`,
                  }))}
                />
              </article>
            ) : (
              <article className="glass-card min-w-0 rounded-lg p-4">
                <h2 className="text-sm text-ink">Payment methods</h2>
                {data.paymentShare.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-soft">No paid orders in this range.</p>
                ) : (
                  <div className="mt-3">
                    <DonutShare slices={data.paymentShare} />
                  </div>
                )}
              </article>
            )}
          </div>

          {data.role === 'owner' ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <article className="glass-card min-w-0 rounded-lg p-4">
                <h2 className="text-sm text-ink">Channel share</h2>
                {data.channelShare.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-soft">No channel revenue in this range.</p>
                ) : (
                  <div className="mt-3">
                    <DonutShare slices={data.channelShare} />
                  </div>
                )}
              </article>
              <article className="glass-card min-w-0 rounded-lg p-4">
                <h2 className="text-sm text-ink">Payment methods</h2>
                {data.paymentShare.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-soft">No paid orders in this range.</p>
                ) : (
                  <div className="mt-3">
                    <DonutShare slices={data.paymentShare} />
                  </div>
                )}
              </article>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
