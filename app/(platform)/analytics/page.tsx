'use client';

/**
 * Analytics. Revenue by channel, the order funnel, and the leaders for the range.
 */

import { useState } from 'react';
import Link from 'next/link';
import { AreaTrend, StageBars } from '@/components/platform/ui/charts';
import { EmptyState, ErrorState, Skeleton } from '@/components/platform/ui';
import { useData } from '@/lib/hooks/use-data';
import { ROUTES } from '@/lib/navigation';
import type { OverviewPayload, OverviewRange } from '@/modules/platform/overview';

const RANGES: readonly { readonly id: OverviewRange; readonly label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '12m', label: '12 months' },
];

export default function AnalyticsPage(): JSX.Element {
  const [range, setRange] = useState<OverviewRange>('7d');
  const state = useData<OverviewPayload>(`/api/platform/overview?range=${range}`);
  const data = state.data;
  const quiet = data ? data.series.every((point) => point.owner + point.reseller + point.api === 0) && data.products.length === 0 : false;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-medium tracking-tight text-ink">Analytics</h1>
          <p className="mt-1 text-sm text-ink-soft">Revenue by channel, orders, and what sold.</p>
        </div>
        <div className="inline-flex rounded-xl border border-white/10 bg-black/25 p-1" role="tablist" aria-label="Range">
          {RANGES.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={range === item.id} className={`h-8 rounded-lg px-3 text-[12.5px] ${range === item.id ? 'bg-white/12 text-ink' : 'text-ink-faint'}`} onClick={() => setRange(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </header>
      {state.loading && !data ? <Skeleton className="h-40 w-full" /> : null}
      {state.error && !data ? <ErrorState message={state.error.message} requestId={state.error.requestId} detail={state.error.detail} onRetry={state.refetch} /> : null}
      {data && quiet ? (
        <EmptyState title="No sales in this range" message="Publish a product and take a paid order. The charts fill in from those orders." action={<Link href={ROUTES.platform.catalog} className="btc-btn-primary">Open products</Link>} />
      ) : null}
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {data.kpis.slice(0, 3).map((kpi) => (
              <article key={kpi.id} className="glass-card rounded-lg p-4">
                <p className="text-xs text-ink-faint">{kpi.label}</p>
                <p className="mt-1 font-num text-2xl text-ink">{kpi.value}</p>
              </article>
            ))}
          </div>
          <article className="glass-card rounded-lg p-4">
            <h2 className="text-sm text-ink">Revenue by channel</h2>
            <p className="mt-1 font-num text-2xl text-ink">{data.revenue}</p>
            <div className="mt-3">
              <AreaTrend
                data={data.series.length > 0 ? data.series : [{ label: 'Now', owner: 0, reseller: 0, api: 0 }]}
                series={[
                  { key: 'owner', label: 'Owner store', color: '#FF4D8D', value: data.legend.owner },
                  { key: 'reseller', label: 'Reseller stores', color: '#F5B042', value: data.legend.reseller },
                  { key: 'api', label: 'API', color: '#5B9DFF', value: data.legend.api },
                ]}
              />
            </div>
          </article>
          <div className="grid gap-3 lg:grid-cols-2">
            <article className="glass-card rounded-lg p-4">
              <h2 className="text-sm text-ink">Order funnel</h2>
              {data.stages.every((stage) => stage.value === 0) ? <p className="mt-3 text-sm text-ink-soft">No orders have moved through the funnel in this range.</p> : <div className="mt-3"><StageBars stages={data.stages} /></div>}
            </article>
            <article className="glass-card rounded-lg p-4">
              <h2 className="text-sm text-ink">Top products</h2>
              {data.products.length === 0 ? <p className="mt-3 text-sm text-ink-soft">No product has sold in this range.</p> : null}
              <ul className="mt-3 space-y-2">
                {data.products.map((product) => (
                  <li key={product.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink">{product.name}</span>
                    <span className="font-num text-ink-soft">{product.units} · {product.revenue}</span>
                  </li>
                ))}
              </ul>
            </article>
            {data.role === 'owner' ? (
              <article className="glass-card rounded-lg p-4">
                <h2 className="text-sm text-ink">Top resellers</h2>
                {data.resellers.length === 0 ? <p className="mt-3 text-sm text-ink-soft">No reseller has sold in this range.</p> : null}
                <ol className="mt-3 space-y-2">
                  {data.resellers.map((reseller, index) => (
                    <li key={reseller.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`${ROUTES.platform.people}?type=reseller&person=${encodeURIComponent(reseller.id)}`} className="text-ink">{index + 1}. {reseller.name}</Link>
                      <span className="font-num text-ink-soft">{reseller.revenue} · {reseller.orders}</span>
                    </li>
                  ))}
                </ol>
              </article>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
