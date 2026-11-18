'use client';

/**
 * A destination whose full screen arrives in a later step.
 * It still loads the live API so the sidebar never opens a blank page.
 */

import { ErrorState } from '@/components/platform/ui';
import { useData } from '@/lib/hooks/use-data';

type ConnectedPageProps = {
  readonly title: string;
  readonly description: string;
  readonly url: string;
};

export function ConnectedPage({ title, description, url }: ConnectedPageProps): JSX.Element {
  const state = useData<unknown>(url);
  return (
    <section className="space-y-3">
      <header>
        <h1 className="text-2xl font-light text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{description}</p>
      </header>
      {state.loading ? <p className="text-sm text-ink-soft">Loading…</p> : null}
      {state.error ? <ErrorState message={state.error.message} requestId={state.error.requestId} detail={state.error.detail} onRetry={state.refetch} /> : null}
      {state.data ? <p className="text-sm text-ink">Live data is connected. The full layout for this screen arrives in a later step.</p> : null}
    </section>
  );
}
