'use client';

/**
 * Platform memory. The GET payload is `{ success, data }`, the same shape as
 * every other platform page. A degraded bank is an empty state, not an error.
 */

import { useState } from 'react';
import { BrainCircuit } from 'lucide-react';
import { Button, EmptyState, ErrorState, RelativeTime, Skeleton } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import type { PublicMemory } from '@/lib/hindsight';

type PlatformIntelligence = {
  readonly memoryCount: number;
  readonly status: 'operational' | 'degraded';
  readonly degraded: boolean;
  readonly platformIntelligence: string | null;
  readonly recentEvents: readonly PublicMemory[];
  readonly evidence: readonly PublicMemory[];
};

const PROMPTS = [
  'What should the platform watch this week?',
  'Which stores are recovering badly?',
  'Where are buyers dropping out?',
] as const;

export default function IntelligencePage(): JSX.Element {
  const state = useData<PlatformIntelligence>('/api/intelligence/platform');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<PlatformIntelligence | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const data = answer ?? state.data;

  async function ask(next: string): Promise<void> {
    const query = next.trim();
    if (!query) return;
    setAsking(true);
    setAskError(null);
    const result = await runAction<PlatformIntelligence>('/api/intelligence/platform', { body: { query } });
    setAsking(false);
    if (!result.ok) {
      setAskError(result.error.message);
      return;
    }
    setAnswer(result.data);
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-[30px] font-medium tracking-tight text-ink">Intelligence</h1>
        <p className="mt-1 text-sm text-ink-soft">What the platform remembers about stores, recovery, and outcomes.</p>
      </header>
      {state.loading && !data ? <Skeleton className="h-40 w-full" /> : null}
      {state.error && !data ? <ErrorState message={state.error.message} requestId={state.error.requestId} detail={state.error.detail} onRetry={state.refetch} /> : null}
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="glass-card rounded-lg p-4">
              <p className="text-xs text-ink-faint">Memories</p>
              <p className="mt-1 font-num text-2xl text-ink">{data.memoryCount}</p>
            </article>
            <article className="glass-card rounded-lg p-4">
              <p className="text-xs text-ink-faint">Bank</p>
              <p className="mt-1 text-sm text-ink">{data.degraded ? 'Unavailable' : 'Answering'}</p>
            </article>
            <article className="glass-card rounded-lg p-4">
              <p className="text-xs text-ink-faint">Evidence</p>
              <p className="mt-1 font-num text-2xl text-ink">{data.evidence.length}</p>
            </article>
          </div>
          <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
            <label className="block text-sm text-ink" htmlFor="intelligence-question">Ask the platform bank</label>
            <textarea id="intelligence-question" className="min-h-24 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} />
            <div className="flex flex-wrap gap-2">
              {PROMPTS.map((prompt) => (
                <button key={prompt} type="button" className="rounded-pill border border-white/10 px-3 py-1 text-xs text-ink-soft" onClick={() => setQuestion(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
            {askError ? <p className="text-sm" style={{ color: 'var(--fault-ink)' }}>{askError}</p> : null}
            <Button type="submit" loading={asking} disabled={question.trim().length === 0}>Ask</Button>
          </form>
          {data.degraded ? (
            <EmptyState title="Memory is not answering" message="The bank is unavailable. The rest of the dashboard keeps working. Try again when the connection is back." action={<Button variant="secondary" onClick={state.refetch}>Try again</Button>} />
          ) : null}
          {data.platformIntelligence ? (
            <article className="glass-card rounded-lg p-4">
              <h2 className="flex items-center gap-2 text-sm text-ink"><BrainCircuit className="h-4 w-4" aria-hidden="true" /> Reading</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{data.platformIntelligence}</p>
            </article>
          ) : null}
          <MemoryList title="Recent events" rows={data.recentEvents} empty="No platform events are stored yet. Activity shows up after buyers and stores do something worth remembering." />
          {data.evidence.length > 0 ? <MemoryList title="Evidence" rows={data.evidence} empty="" /> : null}
        </>
      ) : null}
    </section>
  );
}

function MemoryList({ title, rows, empty }: { readonly title: string; readonly rows: readonly PublicMemory[]; readonly empty: string }): JSX.Element {
  return (
    <article className="glass-card rounded-lg p-4">
      <h2 className="text-sm text-ink">{title}</h2>
      {rows.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{empty}</p> : null}
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md bg-black/20 px-3 py-2">
            <p className="text-sm text-ink">{row.text.replace(/<\/?[a-z][^>]*>/gi, '')}</p>
            <p className="mt-1 text-xs text-ink-faint">{row.type}{row.occurredAt ? <> · <RelativeTime value={row.occurredAt} /></> : null}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}
