'use client';

/**
 * System health. Launch checks only. Secret values are never rendered.
 */

import { ErrorState, Skeleton, StatusPill } from '@/components/platform/ui';
import { useData } from '@/lib/hooks/use-data';

type LaunchCheck = {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly passing: boolean;
  readonly detail: string;
};

const GROUPS = ['environment', 'payment', 'bot', 'product', 'reseller'] as const;

export default function HealthPage(): JSX.Element {
  const state = useData<{ readonly items: readonly LaunchCheck[] }>('/api/owner/launch');
  const items = state.data?.items ?? [];
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-[30px] font-medium tracking-tight text-ink">System health</h1>
        <p className="mt-1 text-sm text-ink-soft">Whether the platform is ready to take orders. Values of secrets stay on the server.</p>
      </header>
      {state.loading && !state.data ? <Skeleton className="h-40 w-full" /> : null}
      {state.error && !state.data ? <ErrorState message={state.error.message} requestId={state.error.requestId} detail={state.error.detail} onRetry={state.refetch} /> : null}
      {state.data ? (
        <div className="space-y-4">
          {GROUPS.map((group) => {
            const rows = items.filter((item) => item.group === group);
            if (rows.length === 0) return null;
            return (
              <article key={group} className="glass-card rounded-lg p-4">
                <h2 className="text-sm capitalize text-ink">{group}</h2>
                <ul className="mt-3 space-y-2">
                  {rows.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-black/20 px-3 py-2">
                      <span className="text-sm text-ink">{item.label}</span>
                      <StatusPill tone={item.passing ? 'ok' : 'fault'}>{item.passing ? 'Passing' : 'Needs attention'}</StatusPill>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
