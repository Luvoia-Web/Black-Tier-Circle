/**
 * @file components/intelligence/CustomerIntelligencePanel.tsx
 *
 * Customer preferences, objections, and a memory-backed recommendation.
 *
 * @module Components
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MemoryInspector } from '@/components/intelligence/MemoryInspector';
import { hasMemoryKind, type IntelligenceMemory } from '@/components/intelligence/types';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { DEMO_CUSTOMER_ID } from '@/lib/intelligence-demo';
import { API_ROUTES } from '@/lib/navigation';
import { formatRelativeTime } from '@/lib/relative-time';

type CustomerIntelligencePanelProps = {
  readonly customerId: string;
  readonly tenantId: string;
  readonly customerName?: string;
};

type CustomerPayload = {
  readonly memories: IntelligenceMemory[];
  readonly recommendation: string | null;
  readonly evidence: IntelligenceMemory[];
  readonly degraded: boolean;
};

const EMPTY: CustomerPayload = {
  memories: [],
  recommendation: null,
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

function MemoryCard({
  memory,
  warning = false,
}: {
  readonly memory: IntelligenceMemory;
  readonly warning?: boolean;
}): JSX.Element {
  return (
    <Card
      padding="p-4"
      className={warning ? 'border-[var(--amber)]/30 bg-[var(--amber-soft)]' : ''}
    >
      <p className="text-sm text-[var(--text-1)]">{memory.text}</p>
      <p className={`mt-2 text-xs ${warning ? 'text-[var(--amber)]' : 'text-[var(--text-3)]'}`}>
        {warning ? 'Objection · ' : ''}
        {formatRelativeTime(memory.occurredAt)}
      </p>
    </Card>
  );
}

export function CustomerIntelligencePanel({
  customerId,
  tenantId,
  customerName,
}: CustomerIntelligencePanelProps): JSX.Element {
  const [withMemory, setWithMemory] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CustomerPayload>(EMPTY);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [outcomeNote, setOutcomeNote] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (customerId === DEMO_CUSTOMER_ID) {
        headers['x-btc-memory-demo'] = '1';
      }
      const response = await fetch(
        `${API_ROUTES.intelligenceCustomer}?customerId=${encodeURIComponent(customerId)}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: 'preferences objections purchase history' }),
        },
      );
      const json = (await response.json()) as Partial<CustomerPayload>;
      setData({
        memories: asMemories(json.memories),
        recommendation: typeof json.recommendation === 'string' ? json.recommendation : null,
        evidence: asMemories(json.evidence),
        degraded: json.degraded === true,
      });
    } catch {
      setData({ ...EMPTY, degraded: true });
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recordOutcome(outcome: 'converted' | 'rejected'): Promise<void> {
    setOutcomeNote(null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (customerId === DEMO_CUSTOMER_ID) {
      headers['x-btc-memory-demo'] = '1';
    }
    const response = await fetch(API_ROUTES.intelligenceOutcome, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId,
        outcome,
        context: data.recommendation ?? 'customer intelligence recommendation',
      }),
    });
    if (response.ok) {
      setOutcomeNote(outcome === 'converted' ? 'Marked converted' : 'Marked rejected');
      toast('✦ Learning loop updated', { duration: 2000 });
    }
  }

  const preferences = data.memories.filter((memory) => hasMemoryKind(memory, 'customer_preference'));
  const objections = data.memories.filter((memory) => hasMemoryKind(memory, 'objection'));
  const title = customerName ? `${customerName}` : 'Customer';

  return (
    <section className="space-y-4" data-tenant={tenantId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--text-1)]">{title}</h2>
        <div className="flex gap-2" role="group" aria-label="Memory comparison">
          <button
            type="button"
            onClick={() => setWithMemory(false)}
            className={`rounded-full px-3 py-1.5 text-xs ${
              withMemory
                ? 'text-[var(--text-2)] hover:bg-[var(--bg-raised)]'
                : 'bg-[var(--accent)] text-white'
            }`}
          >
            Without Memory
          </button>
          <button
            type="button"
            onClick={() => setWithMemory(true)}
            className={`rounded-full px-3 py-1.5 text-xs ${
              withMemory
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-2)] hover:bg-[var(--bg-raised)]'
            }`}
          >
            With Memory
          </button>
        </div>
      </div>

      {withMemory && data.degraded ? (
        <div className="rounded-[var(--r-md)] border border-[var(--amber)]/20 bg-[var(--amber-soft)] px-4 py-2 text-xs text-[var(--amber)]">
          Memory service offline — showing live data only
        </div>
      ) : null}

      {!withMemory ? (
        <Card>
          <p className="text-sm text-[var(--text-1)]">Hello! How can I help you today?</p>
          <p className="mt-4 text-sm text-[var(--text-3)]">No memory available</p>
        </Card>
      ) : loading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Preferences</h3>
            {preferences.length === 0 ? <p className="text-sm text-[var(--text-2)]">No preferences yet.</p> : null}
            {preferences.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} />
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Known Objections</h3>
            {objections.length === 0 ? <p className="text-sm text-[var(--text-2)]">No objections yet.</p> : null}
            {objections.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} warning />
            ))}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">AI Recommendation</h3>
            <Card>
              <p className="whitespace-pre-wrap text-sm text-[var(--text-1)]">
                {data.recommendation ?? 'No recommendation yet.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-[var(--accent-soft)]"
                  onClick={() => setInspectorOpen(true)}
                >
                  WHY? See Evidence
                </button>
                <button type="button" className="text-xs text-[var(--green)]" onClick={() => void recordOutcome('converted')}>
                  ✓ Converted
                </button>
                <button type="button" className="text-xs text-[var(--red)]" onClick={() => void recordOutcome('rejected')}>
                  ✗ Rejected
                </button>
                {outcomeNote ? <span className="text-xs text-[var(--text-3)]">{outcomeNote}</span> : null}
              </div>
            </Card>
          </div>
        </>
      )}

      {inspectorOpen ? (
        <MemoryInspector
          evidence={data.evidence}
          recommendation={data.recommendation ?? 'No recommendation yet.'}
          onClose={() => setInspectorOpen(false)}
        />
      ) : null}
    </section>
  );
}
