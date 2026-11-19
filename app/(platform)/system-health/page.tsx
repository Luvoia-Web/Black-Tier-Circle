'use client';

import { ErrorState, Skeleton, StatusPill } from '@/components/platform/ui';
import { useData } from '@/lib/hooks/use-data';

type LaunchCheck = {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly passing: boolean;
};

const GROUPS = ['environment', 'payment', 'bot', 'product', 'reseller'] as const;

export default function SystemHealthPage(): JSX.Element {
  const state = useData<{ readonly items: readonly LaunchCheck[] }>('/api/owner/launch');
  const items = state.data?.items ?? [];
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-[30px] font-medium tracking-tight text-ink">System health</h1>
        <p className="mt-1 text-sm text-ink-soft">Launch checks. Secret values stay on the server.</p>
      </header>
      {state.loading && !state.data ? <Skeleton className="h-40 w-full" /> : null}
      {state.error && !state.data ? <ErrorState message={state.error.message} onRetry={state.refetch} /> : null}
      {state.data ? GROUPS.map((group) => {
        const rows = items.filter((item) => item.group === group);
        if (rows.length === 0) return null;
        return (
          <article key={group} className="glass-card rounded-lg p-4">
            <h2 className="text-sm capitalize text-ink">{group}</h2>
            <ul className="mt-3 space-y-2">
              {rows.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-black/20 px-3 py-2">
                  <span className="text-sm text-ink">{item.label}</span>
                  <StatusPill tone={item.passing ? 'ok' : 'fault'}>{item.passing ? 'Passing' : 'Needs attention'}</StatusPill>
                </li>
              ))}
            </ul>
          </article>
        );
      }) : null}
    </section>
  );
}
