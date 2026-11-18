'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Heart, Package, Receipt, Repeat, ShoppingBag, Timer, Wallet } from 'lucide-react';
import { AreaTrend, CHART_COLORS, Sparkline, StageBars } from '@/components/platform/ui/charts';
import { DeltaPill, ErrorState, RelativeTime, StatTile } from '@/components/platform/ui';
import { useData } from '@/lib/hooks/use-data';
import { ROUTES } from '@/lib/navigation';
import type { OverviewPayload, OverviewRange } from '@/modules/platform/overview';

const RANGES: readonly { readonly id: OverviewRange; readonly label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '12m', label: '12 months' },
];

const ICONS = {
  orders: ShoppingBag,
  average: Receipt,
  conversion: Timer,
  repeat: Heart,
  pending: Package,
  supplier: Wallet,
} as const;

export default function OverviewPage(): JSX.Element {
  const [range, setRange] = useState<OverviewRange>('7d');
  const state = useData<OverviewPayload>(`/api/platform/overview?range=${range}`);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const data = state.data;

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-display font-light text-ink">{hello}{data ? `, ${data.firstName}` : ''}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {data ? `${data.dateLabel} · ${data.summary}` : 'Loading the day.'}
        </p>
      </header>
      {state.loading && !data ? <p className="text-sm text-ink-soft">Loading…</p> : null}
      {state.error ? <ErrorState message={state.error.message} requestId={state.error.requestId} detail={state.error.detail} onRetry={state.refetch} /> : null}
      {data ? (
        <>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
            <article className="glass-card rounded-lg p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-ink-soft">Revenue · {RANGES.find((item) => item.id === range)?.label}</p>
                  <p className="mt-1 text-display font-light tabular-nums text-ink">{data.revenue}</p>
                  <DeltaPill tone={data.deltaPercent >= 0 ? 'up' : 'down'}>{data.deltaPercent >= 0 ? '+' : ''}{data.deltaPercent.toFixed(1)}%</DeltaPill>
                </div>
                <div className="flex rounded-pill bg-black/30 p-1">
                  {RANGES.map((item) => (
                    <button key={item.id} type="button" className={`rounded-pill px-3 py-1 text-xs ${range === item.id ? 'bg-white/10 text-ink' : 'text-ink-faint'}`} onClick={() => setRange(item.id)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <AreaTrend
                  data={data.series.length > 0 ? data.series : [{ label: 'Now', owner: 0, reseller: 0, api: 0 }]}
                  series={[
                    { key: 'owner', label: 'Owner store', color: CHART_COLORS.rose, value: data.legend.owner },
                    { key: 'reseller', label: 'Reseller stores', color: CHART_COLORS.amber, value: data.legend.reseller },
                    { key: 'api', label: 'API', color: CHART_COLORS.sky, value: data.legend.api },
                  ]}
                />
              </div>
            </article>
            <article className="glass-card rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm text-ink">Right now</h2>
                <span className="inline-flex items-center gap-1 rounded-pill bg-mint/15 px-2 py-0.5 text-xs text-mint">Live</span>
              </div>
              <p className="mt-3 text-display font-light tabular-nums text-ink">{data.live}</p>
              <p className="text-xs text-ink-faint">buyers active</p>
              <Sparkline data={[Math.max(data.live - 2, 0), data.live, data.live]} />
              <div className="mt-3">
                <StageBars stages={data.stages} />
              </div>
              <ul className="mt-4 space-y-3">
                {data.sales.length === 0 ? <li className="text-sm text-ink-soft">No paid orders in this range.</li> : null}
                {data.sales.map((sale) => (
                  <li key={sale.id} className="flex items-start justify-between gap-3 text-sm">
                    <span>
                      <span className="block text-ink">{sale.buyer}</span>
                      <span className="block text-xs text-ink-faint">{sale.product} · {sale.store} · <RelativeTime value={sale.at} /></span>
                    </span>
                    <span className="tabular-nums text-ink">{sale.amount}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.kpis.filter((kpi) => data.role === 'owner' || kpi.id !== 'supplier').map((kpi) => (
              <StatTile key={kpi.id} label={kpi.label} value={kpi.value} icon={ICONS[kpi.id as keyof typeof ICONS]} {...(kpi.delta ? { delta: kpi.delta, deltaTone: kpi.tone } : {})} tone={kpi.tone === 'down' ? 'amber' : 'rose'} />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <article className="glass-card rounded-lg p-4">
              <h2 className="text-sm text-ink">Needs your attention <span className="tabular-nums text-ink-faint">{data.attention.length}</span></h2>
              <ul className="mt-3 space-y-2">
                {data.attention.length === 0 ? <li className="text-sm text-ink-soft">Nothing is waiting.</li> : null}
                {data.attention.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-3 py-2">
                    <span className="text-sm text-ink">{item.problem}</span>
                    <Link href={item.href} className="shrink-0 rounded-pill bg-rose px-3 py-1 text-xs text-white">{item.actionLabel}</Link>
                  </li>
                ))}
              </ul>
            </article>
            {data.role === 'owner' ? (
              <article className="glass-card rounded-lg p-4">
                <h2 className="text-sm text-ink">Top resellers</h2>
                <ol className="mt-3 space-y-2">
                  {data.resellers.length === 0 ? <li className="text-sm text-ink-soft">No reseller sales in this range.</li> : null}
                  {data.resellers.map((reseller, index) => (
                    <li key={reseller.id}>
                      <Link href={`${ROUTES.platform.people}?type=reseller&person=${encodeURIComponent(reseller.id)}`} className="flex items-center justify-between gap-3 text-sm text-ink">
                        <span>{index + 1}. {reseller.name}</span>
                        <span className="tabular-nums text-ink-soft">{reseller.revenue} · {reseller.orders}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </article>
            ) : null}
            <article className="glass-card rounded-lg p-4">
              <h2 className="text-sm text-ink">Top products</h2>
              <ul className="mt-3 space-y-2">
                {data.products.length === 0 ? <li className="text-sm text-ink-soft">No product sales in this range.</li> : null}
                {data.products.map((product) => (
                  <li key={product.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink">{product.name}</span>
                    <span className="tabular-nums text-ink-soft">{product.units} · {product.revenue}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}
