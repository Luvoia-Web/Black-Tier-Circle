/**
 * @file components/intelligence/ControlTowerPanel.tsx
 *
 * Owner mission-control view of the platform memory bank.
 * Aggregate patterns only. Customer banks are not requested.
 *
 * @module Components
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Activity, Brain, Radio, RefreshCw } from 'lucide-react';
import type { IntelligenceMemory } from '@/components/intelligence/types';
import { Badge } from '@/components/ui/Badge';
import { API_ROUTES } from '@/lib/navigation';
import { formatRelativeTime } from '@/lib/relative-time';

type PlatformPayload = {
  readonly platformIntelligence: string | null;
  readonly recentEvents: IntelligenceMemory[];
  readonly evidence: IntelligenceMemory[];
  readonly degraded: boolean;
};

type ActivityPayload = {
  readonly memoryCount: number;
  readonly status: string;
  readonly degraded: boolean;
};

const EMPTY_PLATFORM: PlatformPayload = {
  platformIntelligence: null,
  recentEvents: [],
  evidence: [],
  degraded: false,
};

function asMemories(value: unknown): IntelligenceMemory[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (item === null || typeof item !== 'object') {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.text !== 'string') {
      return [];
    }
    const tags = Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string')
      : [];
    return [
      {
        id: record.id,
        text: record.text,
        type: typeof record.type === 'string' ? record.type : '',
        context: typeof record.context === 'string' ? record.context : '',
        occurredAt: typeof record.occurredAt === 'string' ? record.occurredAt : null,
        tags,
      },
    ];
  });
}

function eventLabel(memory: IntelligenceMemory): string {
  const tagged = memory.tags.find((tag) => tag.startsWith('event:') || tag.startsWith('kind:'));
  if (tagged) {
    return tagged.split(':').slice(1).join(':') || tagged;
  }
  if (memory.type.trim().length > 0) {
    return memory.type.replace(/^kind:/, '');
  }
  return 'event';
}

function useCountUp(target: number, active: boolean): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }
    if (reduced) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const duration = 720;
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(target * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reduced, target]);

  return value;
}

const LIST_VARIANTS = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
};

const STILL_VARIANTS = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0 },
};

function TowerSkeleton(): JSX.Element {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="skeleton shimmer h-14 rounded-[var(--r-lg)]" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton shimmer h-52 rounded-[var(--r-lg)] lg:col-span-2" />
        <div className="skeleton shimmer h-52 rounded-[var(--r-lg)]" />
      </div>
      <div className="skeleton shimmer h-40 rounded-[var(--r-lg)]" />
    </div>
  );
}

/**
 * Loads platform intelligence, recent events, and memory activity.
 */
export function ControlTowerPanel(): JSX.Element {
  const reduced = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<PlatformPayload>(EMPTY_PLATFORM);
  const [activity, setActivity] = useState<ActivityPayload>({
    memoryCount: 0,
    status: 'operational',
    degraded: false,
  });
  const degraded = platform.degraded || activity.degraded;
  const shownCount = useCountUp(activity.memoryCount, !loading);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [postResponse, getResponse] = await Promise.all([
        fetch(API_ROUTES.intelligencePlatform, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'What operational patterns should the platform watch across stores?',
          }),
        }),
        fetch(API_ROUTES.intelligencePlatform),
      ]);
      const postJson = (await postResponse.json()) as Partial<PlatformPayload>;
      const getJson = (await getResponse.json()) as Partial<ActivityPayload>;
      setPlatform({
        platformIntelligence:
          typeof postJson.platformIntelligence === 'string' ? postJson.platformIntelligence : null,
        recentEvents: asMemories(postJson.recentEvents),
        evidence: asMemories(postJson.evidence),
        degraded: !postResponse.ok || postJson.degraded === true,
      });
      setActivity({
        memoryCount: typeof getJson.memoryCount === 'number' ? getJson.memoryCount : 0,
        status: getJson.degraded === true ? 'degraded' : 'operational',
        degraded: !getResponse.ok || getJson.degraded === true,
      });
    } catch {
      setPlatform({ ...EMPTY_PLATFORM, degraded: true });
      setActivity({ memoryCount: 0, status: 'degraded', degraded: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const listVariants = reduced ? STILL_VARIANTS : LIST_VARIANTS;
  const itemVariants = reduced ? STILL_VARIANTS : ITEM_VARIANTS;

  return (
    <section className="space-y-4" aria-busy={loading}>
      <p className="sr-only" role="status" aria-atomic="true">
        {loading
          ? 'Loading platform intelligence'
          : degraded
            ? 'Memory layer degraded'
            : `Memory layer operational, ${activity.memoryCount} platform memories`}
      </p>

      {loading ? <TowerSkeleton /> : null}

      {loading ? null : (
        <motion.div
          className="space-y-4"
          initial={reduced ? false : 'hidden'}
          animate="show"
          variants={listVariants}
        >
          {degraded ? (
            <div
              role="status"
              className="rounded-[var(--r-md)] border border-[var(--amber)]/30 bg-[var(--amber-soft)] px-4 py-3 text-sm text-[var(--text-1)]"
            >
              Memory layer degraded. Platform intelligence is unavailable until the memory service responds.
            </div>
          ) : null}

          <motion.div
            variants={itemVariants}
            className="flex flex-col gap-3 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                {degraded ? null : (
                  <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-[var(--green)] opacity-60" />
                )}
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    degraded ? 'bg-[var(--amber)]' : 'bg-[var(--green)]'
                  }`}
                />
              </span>
              <p className="text-sm font-medium text-[var(--text-1)]">
                Memory layer: {degraded ? 'degraded' : 'operational'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-raised)] px-4 text-sm text-[var(--text-1)] transition-colors duration-200 hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </button>
          </motion.div>

          <div className="grid gap-4 lg:grid-cols-3">
            <motion.article
              variants={itemVariants}
              className="relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)] lg:col-span-2"
            >
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--accent-glow),transparent_58%)]"
                aria-hidden="true"
              />
              <div className="relative">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--text-3)]">
                  <Brain className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
                  Platform intelligence
                </div>
                <p className="mt-4 max-w-3xl whitespace-pre-wrap text-base leading-relaxed text-[var(--text-1)] sm:text-lg">
                  {platform.platformIntelligence ?? 'No platform insight yet. Refresh after the platform bank has activity.'}
                </p>
                {platform.evidence.length > 0 ? (
                  <p className="mt-4 text-xs text-[var(--text-3)]">
                    Grounded in {platform.evidence.length} platform {platform.evidence.length === 1 ? 'memory' : 'memories'}
                  </p>
                ) : null}
              </div>
            </motion.article>

            <motion.article
              variants={itemVariants}
              className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--text-3)]">
                <Activity className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
                Memory activity
              </div>
              <p className="mt-6 font-mono text-5xl font-semibold tabular-nums tracking-tight text-[var(--text-1)]">
                {shownCount}
              </p>
              <p className="mt-2 text-sm text-[var(--text-2)]">Memories in the platform bank</p>
            </motion.article>
          </div>

          <motion.article
            variants={itemVariants}
            className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--text-3)]">
              <Radio className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
              Recent platform events
            </div>
            {platform.recentEvents.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--text-2)]">No platform events recalled yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--border)]">
                {platform.recentEvents.map((memory) => (
                  <li key={memory.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <Badge variant="accent">{eventLabel(memory)}</Badge>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--text-1)]">{memory.text}</p>
                    </div>
                    <time
                      className="shrink-0 font-mono text-xs text-[var(--text-3)]"
                      dateTime={memory.occurredAt ?? undefined}
                    >
                      {formatRelativeTime(memory.occurredAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </motion.article>
        </motion.div>
      )}
    </section>
  );
}
