'use client';

/**
 * Platform Intelligence view. Deduplicates memories, hides low-signal boilerplate,
 * paginates results, and loads fast with multi-block skeletons.
 */

import { useEffect, useState } from 'react';
import { BrainCircuit, RefreshCw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  Pagination,
  RelativeTime,
  Skeleton,
  StatTile,
} from '@/components/platform/ui';
import { displayMemoryType, formatPlainDatesInText } from '@/lib/display-labels';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import type { PublicMemory } from '@/lib/hindsight';
import type { MemoryBankState, MemoryCategory, PlatformIntelligencePayload } from '@/modules/platform/intelligence';

const BANK_LABEL: Readonly<
  Record<MemoryBankState, { value: string; hint: string; tone: 'mint' | 'amber' | 'danger'; title: string; message: string }>
> = {
  ready: { value: 'Answering', hint: 'Hindsight connected', tone: 'mint', title: '', message: '' },
  loading: {
    value: 'Loading',
    hint: 'The bank is slow to answer',
    tone: 'amber',
    title: 'Memory is still loading',
    message: 'The memory bank took longer than 8 seconds. Nothing is wrong yet. Try again in a moment.',
  },
  unavailable: {
    value: 'Unavailable',
    hint: 'Hindsight returned an error',
    tone: 'danger',
    title: 'Memory is not answering',
    message: 'The memory bank returned an error. The rest of the dashboard keeps working.',
  },
  not_configured: {
    value: 'Not set up',
    hint: 'Hindsight keys are missing',
    tone: 'amber',
    title: 'Memory is not set up',
    message: 'Set HINDSIGHT_ENABLED, HINDSIGHT_API_KEY and HINDSIGHT_API_URL on the server to turn memory on.',
  },
};

const PROMPTS = [
  'What should the platform watch this week?',
  'Which stores are recovering badly?',
  'Where are buyers dropping out?',
] as const;

const CATEGORIES: readonly { readonly id: MemoryCategory; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'decision', label: 'Decisions' },
  { id: 'experience', label: 'Experiences' },
  { id: 'observation', label: 'Observations' },
  { id: 'fact', label: 'Facts' },
];

export function IntelligenceView(): JSX.Element {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<MemoryCategory>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(searchInput.trim());
      setPage(1);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const url = `/api/intelligence/platform?page=${page}&pageSize=10&category=${category}&q=${encodeURIComponent(debouncedQ)}${
    refreshTick > 0 ? `&refresh=1&t=${refreshTick}` : ''
  }`;
  const state = useData<PlatformIntelligencePayload>(url);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<PlatformIntelligencePayload | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const baseData = state.data;
  const readingText = answer?.platformIntelligence ?? baseData?.platformIntelligence ?? null;
  const evidence = answer?.evidence ?? baseData?.evidence ?? [];
  const data = baseData;

  async function ask(next: string): Promise<void> {
    const query = next.trim();
    if (!query) return;
    setAsking(true);
    setAskError(null);
    const result = await runAction<PlatformIntelligencePayload>('/api/intelligence/platform', {
      body: { query },
    });
    setAsking(false);
    if (!result.ok) {
      setAskError(result.error.message);
      return;
    }
    setAnswer(result.data);
  }

  const noiseAndDupes = data ? data.hiddenNoiseCount + data.duplicateCount : 0;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-medium tracking-tight text-ink">Intelligence</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Deduplicated platform memories, store patterns, and recovery evidence.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={state.loading}
          onClick={() => {
            setAnswer(null);
            setRefreshTick((n) => n + 1);
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh memory
        </Button>
      </header>

      {state.loading && !data ? (
        <div className="space-y-4" aria-label="Loading intelligence">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="glass-card rounded-lg p-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
          <div className="glass-card rounded-lg p-4 space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="glass-card rounded-lg p-4 space-y-2.5">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
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

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            <StatTile
              label="Unique memories"
              value={String(data.memoryCount)}
              hint={noiseAndDupes > 0 ? `${data.duplicateCount} duplicates · ${data.hiddenNoiseCount} low-signal hidden` : 'From platform bank'}
              icon={BrainCircuit}
              tone="rose"
            />
            <StatTile
              label="Memory bank"
              value={BANK_LABEL[data.bankState].value}
              hint={data.timedOut && data.bankState === 'ready' ? 'Showing the saved snapshot' : BANK_LABEL[data.bankState].hint}
              icon={ShieldCheck}
              tone={BANK_LABEL[data.bankState].tone}
            />
            <StatTile
              label="Evidence citations"
              value={String(evidence.length)}
              hint="From latest question"
              icon={Sparkles}
              tone="sky"
            />
          </div>

          <form
            className="glass-card space-y-3 rounded-lg p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
          >
            <label className="block text-sm text-ink" htmlFor="intelligence-question">
              Ask the platform bank
            </label>
            <textarea
              id="intelligence-question"
              className="min-h-24 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
              placeholder="Ask about store behavior, recovery patterns, or product demand..."
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={2000}
            />
            <div className="flex flex-wrap gap-2">
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="rounded-pill border border-white/10 px-3 py-1 text-xs text-ink-soft transition hover:border-white/25 hover:text-ink"
                  onClick={() => setQuestion(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
            {askError ? (
              <p className="text-sm" style={{ color: 'var(--fault-ink)' }}>
                {askError}
              </p>
            ) : null}
            <Button type="submit" loading={asking} disabled={question.trim().length === 0}>
              Ask
            </Button>
          </form>

          {data.bankState !== 'ready' ? (
            <EmptyState
              title={BANK_LABEL[data.bankState].title}
              message={BANK_LABEL[data.bankState].message}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRefreshTick((n) => n + 1);
                    state.refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : null}

          {readingText ? (
            <article className="glass-card rounded-lg p-4">
              <h2 className="flex items-center gap-2 text-sm text-ink">
                <BrainCircuit className="h-4 w-4 text-rose" aria-hidden="true" /> Reading
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {formatPlainDatesInText(readingText)}
              </p>
            </article>
          ) : null}

          {data.bankState === 'ready' ? (
            <article className="glass-card space-y-3 rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm text-ink">Recent events</h2>
                <p className="font-num text-xs text-ink-faint">
                  {data.pagination.total} shown
                  {noiseAndDupes > 0 ? ` · ${noiseAndDupes} noisy or duplicate entries filtered` : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Memory category">
                  {CATEGORIES.map((item) => {
                    const count = data.typeCounts[item.id] ?? 0;
                    const active = category === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`rounded-pill border px-2.5 py-1 text-xs transition ${
                          active
                            ? 'border-white/25 bg-white/12 text-ink'
                            : 'border-white/10 text-ink-faint hover:text-ink-soft'
                        }`}
                        onClick={() => {
                          setCategory(item.id);
                          setPage(1);
                        }}
                      >
                        {item.label} <span className="font-num text-[11px] opacity-75">{count}</span>
                      </button>
                    );
                  })}
                </div>

                <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
                  <span className="sr-only">Filter memories</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Filter memories..."
                    className="h-9 w-full rounded-lg border border-white/10 bg-black/25 pl-8 pr-3 text-xs text-ink placeholder:text-ink-faint"
                  />
                </label>
              </div>

              {state.loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
                </div>
              ) : (
                <MemoryList
                  rows={data.recentEvents}
                  empty={
                    debouncedQ || category !== 'all'
                      ? 'No memories match this filter.'
                      : 'No unique platform events are stored yet. Activity shows up as stores complete orders.'
                  }
                />
              )}

              {data.pagination.total > data.pagination.pageSize ? (
                <Pagination
                  page={data.pagination.page}
                  pageSize={data.pagination.pageSize}
                  total={data.pagination.total}
                  onPage={setPage}
                />
              ) : null}
            </article>
          ) : null}

          {evidence.length > 0 ? (
            <article className="glass-card rounded-lg p-4">
              <h2 className="text-sm text-ink">Evidence</h2>
              <div className="mt-3">
                <MemoryList rows={evidence} empty="" />
              </div>
            </article>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function MemoryList({
  rows,
  empty,
}: {
  readonly rows: readonly PublicMemory[];
  readonly empty: string;
}): JSX.Element {
  if (rows.length === 0) {
    return <p className="py-2 text-sm text-ink-soft">{empty}</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="rounded-md bg-black/20 px-3 py-2.5">
          <p className="text-sm text-ink">{formatPlainDatesInText(row.text)}</p>
          <p className="mt-1 text-xs text-ink-faint">
            {displayMemoryType(row.type)}
            {row.occurredAt ? (
              <>
                {' '}
                · <RelativeTime value={row.occurredAt} />
              </>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}
