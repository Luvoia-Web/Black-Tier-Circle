'use client';

/**
 * Supplier connector health. A failed probe is a status, not a crashed page.
 */

import Link from 'next/link';
import { ErrorState, Skeleton, StatusPill } from '@/components/platform/ui';
import { useData } from '@/lib/hooks/use-data';
import { ROUTES } from '@/lib/navigation';

type SupplierHealth = {
  readonly healthy: boolean;
  readonly supplier: string;
  readonly mode: string;
};

export default function SupplierHealthPage(): JSX.Element {
  const state = useData<SupplierHealth>('/api/supplier/health');
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-[30px] font-medium tracking-tight text-ink">Supplier health</h1>
        <p className="mt-1 text-sm text-ink-soft">Whether the active supplier is answering.</p>
      </header>
      {state.loading && !state.data ? <Skeleton className="h-32 w-full" /> : null}
      {state.error && !state.data ? <ErrorState message={state.error.message} requestId={state.error.requestId} detail={state.error.detail} onRetry={state.refetch} /> : null}
      {state.data ? (
        <article className="glass-card space-y-2 rounded-lg p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-ink">{state.data.supplier}</p>
            <StatusPill tone={state.data.healthy ? 'ok' : 'fault'}>{state.data.healthy ? 'Answering' : 'Not answering'}</StatusPill>
          </div>
          <p className="text-xs text-ink-faint">Mode {state.data.mode}</p>
          <Link href={`${ROUTES.platform.catalog}?section=suppliers&panel=health`} className="inline-flex text-sm text-rose">Open supplier balances</Link>
        </article>
      ) : null}
    </section>
  );
}