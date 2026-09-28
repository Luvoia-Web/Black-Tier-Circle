/**
 * @file components/intelligence/StoreIntelligencePanel.tsx
 *
 * What the store has learned, plus active seller instructions.
 *
 * @module Components
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { IntelligenceMemory } from '@/components/intelligence/types';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { DEMO_TENANT_ID } from '@/lib/intelligence-demo';
import { API_ROUTES } from '@/lib/navigation';
import { formatRelativeTime } from '@/lib/relative-time';

type StoreIntelligencePanelProps = {
  readonly tenantId: string;
};

type StorePayload = {
  readonly intelligence: string | null;
  readonly evidence: IntelligenceMemory[];
  readonly sellerInstructions: IntelligenceMemory[];
  readonly degraded: boolean;
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

export function StoreIntelligencePanel({ tenantId }: StoreIntelligencePanelProps): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [data, setData] = useState<StorePayload>({
    intelligence: null,
    evidence: [],
    sellerInstructions: [],
    degraded: false,
  });

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantId === DEMO_TENANT_ID) {
        headers['x-btc-memory-demo'] = '1';
      }
      const response = await fetch(API_ROUTES.intelligenceStore, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const json = (await response.json()) as {
        intelligence?: string | null;
        evidence?: unknown;
        sellerInstructions?: unknown;
        degraded?: boolean;
      };
      setData({
        intelligence: typeof json.intelligence === 'string' ? json.intelligence : null,
        evidence: asMemories(json.evidence),
        sellerInstructions: asMemories(json.sellerInstructions),
        degraded: json.degraded === true,
      });
      setUpdatedAt(new Date().toISOString());
    } catch {
      setData({ intelligence: null, evidence: [], sellerInstructions: [], degraded: true });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--text-1)]">Store intelligence</h2>
        <button type="button" onClick={() => void load()} className="rounded-md border border-[var(--border-soft)] px-3 py-2 text-sm">
          Refresh
        </button>
      </div>
      {data.degraded ? (
        <div className="rounded-[var(--r-md)] border border-[var(--amber)]/20 bg-[var(--amber-soft)] px-4 py-2 text-xs text-[var(--amber)]">
          Memory service offline — showing live data only
        </div>
      ) : null}
      <p className="text-xs text-[var(--text-3)]">Last updated: {updatedAt ? formatRelativeTime(updatedAt) : 'just now'}</p>
      {loading ? (
        <SkeletonCard />
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">What your store has learned</h3>
            <Card>
              <p className="whitespace-pre-wrap text-sm text-[var(--text-1)]">
                {data.intelligence ?? 'No store memory yet.'}
              </p>
            </Card>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Active seller instructions</h3>
            {data.sellerInstructions.length === 0 ? (
              <p className="text-sm text-[var(--text-2)]">No seller instructions yet.</p>
            ) : null}
            {data.sellerInstructions.map((item) => (
              <Card key={item.id} padding="p-4">
                <p className="text-sm text-[var(--text-1)]">{item.text}</p>
                <p className="mt-2 text-xs text-[var(--text-3)]">{formatRelativeTime(item.occurredAt)}</p>
              </Card>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Evidence</h3>
            {data.evidence.length === 0 ? <p className="text-sm text-[var(--text-2)]">No evidence yet.</p> : null}
            <ul className="space-y-2 text-sm">
              {data.evidence.map((item) => (
                <li key={item.id} className="border-b border-[var(--border)] py-2">
                  <p className="text-[var(--text-1)]">{item.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-2)]">
                    <span className="rounded-full bg-[var(--bg-raised)] px-2 py-0.5 uppercase tracking-wide">
                      {item.type || 'memory'}
                    </span>
                    {item.context ? <span>{item.context}</span> : null}
                    <span>{formatRelativeTime(item.occurredAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
