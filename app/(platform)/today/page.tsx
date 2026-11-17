'use client';

/**
 * Today is a triage list. The calm state is the day's numbers.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, ErrorState, Skeleton, StatusPill } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES } from '@/lib/navigation';

type TodayItem = {
  readonly id: string;
  readonly problem: string;
  readonly actionLabel: string;
  readonly action: 'retry' | 'approve' | 'open';
  readonly href: string;
  readonly targetId: string;
};

type TodayPayload = {
  readonly items: readonly TodayItem[];
  readonly supportNeedsMigration: boolean;
  readonly day: { readonly orders: number; readonly revenue: string; readonly newBuyers: number };
};

export default function TodayPage(): JSX.Element {
  const router = useRouter();
  const { data, loading, error, refetch } = useData<TodayPayload>('/api/platform/today');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (loading) {
    return <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>;
  }
  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />;
  }
  if (!data) {
    return <EmptyState title="Today is empty" message="Refresh to load what needs attention." action={<Button onClick={refetch}>Refresh</Button>} />;
  }

  async function run(item: TodayItem): Promise<void> {
    if (item.action === 'open') {
      router.push(item.href);
      return;
    }
    setBusy(item.id);
    setNotice(null);
    const result = item.action === 'retry'
      ? await runAction(API_ROUTES.fulfillmentRetryDelivery(item.targetId))
      : await runAction(API_ROUTES.resellerStatus(item.targetId), { method: 'PATCH', body: { status: 'active' } });
    setBusy(null);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice(item.action === 'retry' ? 'Retry started.' : 'Reseller approved.');
    refetch();
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl text-ink">Today</h1>
        <p className="mt-1 text-sm text-ink-soft">What needs a decision right now.</p>
      </header>
      {data.supportNeedsMigration ? (
        <ErrorState title="Needs migration 0032" message="Support threads are not available until migration 0032 is applied. The rest of Today still works." />
      ) : null}
      {notice ? <p className="text-sm text-ink">{notice}</p> : null}
      {data.items.length === 0 ? (
        <div className="space-y-3">
          <EmptyState title="Nothing needs attention" message="Failed orders, stuck fulfillment, stock, balances, approvals, and support are clear." />
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-stroke bg-raised px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.12em] text-ink-faint">Orders today</dt>
              <dd className="mt-1 text-right font-num text-xl text-ink">{data.day.orders}</dd>
            </div>
            <div className="rounded-lg border border-stroke bg-raised px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.12em] text-ink-faint">Revenue today</dt>
              <dd className="mt-1 text-right font-num text-xl text-ink">{data.day.revenue}</dd>
            </div>
            <div className="rounded-lg border border-stroke bg-raised px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.12em] text-ink-faint">New buyers</dt>
              <dd className="mt-1 text-right font-num text-xl text-ink">{data.day.newBuyers}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <ul className="divide-y divide-stroke rounded-lg border border-stroke bg-raised">
          {data.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <StatusPill tone={item.action === 'retry' ? 'fault' : 'warn'}>{item.actionLabel}</StatusPill>
                <p className="mt-1 text-sm text-ink">{item.problem}</p>
              </div>
              <Button variant={item.action === 'retry' ? 'secondary' : 'primary'} loading={busy === item.id} onClick={() => void run(item)}>
                {item.actionLabel}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
