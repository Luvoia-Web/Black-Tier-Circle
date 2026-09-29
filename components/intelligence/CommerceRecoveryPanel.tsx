/**
 * @file components/intelligence/CommerceRecoveryPanel.tsx
 *
 * Looks up how a similar incident was resolved before.
 *
 * @module Components
 */

'use client';

import { useState } from 'react';
import type { IntelligenceMemory } from '@/components/intelligence/types';
import { Card } from '@/components/ui/Card';
import { DEMO_TENANT_ID } from '@/lib/intelligence-demo';
import { API_ROUTES } from '@/lib/navigation';
import { formatRelativeTime } from '@/lib/relative-time';

type CommerceRecoveryPanelProps = {
  readonly tenantId: string;
};

const INCIDENTS = ['Supplier Outage', 'Payment Failure', 'Delivery Failure', 'Other'] as const;

type RecoveryPayload = {
  readonly pastIncidents: IntelligenceMemory[];
  readonly suggestedRecovery: string | null;
  readonly evidence: IntelligenceMemory[];
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

export function CommerceRecoveryPanel({ tenantId }: CommerceRecoveryPanelProps): JSX.Element {
  const [description, setDescription] = useState('');
  const [incidentType, setIncidentType] = useState<(typeof INCIDENTS)[number]>('Supplier Outage');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecoveryPayload | null>(null);

  async function findRecovery(): Promise<void> {
    const text = description.trim();
    if (!text || loading) {
      return;
    }
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantId === DEMO_TENANT_ID) {
        headers['x-btc-memory-demo'] = '1';
      }
      const response = await fetch(API_ROUTES.intelligenceRecovery, {
        method: 'POST',
        headers,
        body: JSON.stringify({ incidentType, description: text }),
      });
      const json = (await response.json()) as {
        pastIncidents?: unknown;
        suggestedRecovery?: string | null;
        evidence?: unknown;
        degraded?: boolean;
      };
      setResult({
        pastIncidents: asMemories(json.pastIncidents),
        suggestedRecovery: typeof json.suggestedRecovery === 'string' ? json.suggestedRecovery : null,
        evidence: asMemories(json.evidence),
        degraded: json.degraded === true,
      });
      window.dispatchEvent(
        new CustomEvent('btc:memory-activity', {
          detail: { text: `Recovery searched for ${incidentType.toLowerCase()}`, tone: 'orange' },
        }),
      );
    } catch {
      setResult({ pastIncidents: [], suggestedRecovery: null, evidence: [], degraded: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-[var(--text-1)]">Commerce recovery</h2>
      <Card>
        <label className="block text-sm text-[var(--text-2)]" htmlFor="incident-description">
          Describe the current incident
        </label>
        <textarea
          id="incident-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="btc-input mt-2 min-h-24"
          placeholder="Supplier API stopped responding during checkout"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm text-[var(--text-2)]" htmlFor="incident-type">
            Incident type
          </label>
          <select
            id="incident-type"
            value={incidentType}
            onChange={(event) => setIncidentType(event.target.value as (typeof INCIDENTS)[number])}
            className="btc-select"
          >
            {INCIDENTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button type="button" className="btc-btn-primary" disabled={loading || description.trim().length === 0} onClick={() => void findRecovery()}>
            {loading ? 'Finding…' : 'Find Recovery'}
          </button>
        </div>
      </Card>
      {result?.degraded ? (
        <div className="rounded-[var(--r-md)] border border-[var(--amber)]/20 bg-[var(--amber-soft)] px-4 py-2 text-xs text-[var(--amber)]">
          Memory service offline — showing live data only
        </div>
      ) : null}
      {result ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Suggested recovery</h3>
            <Card>
              <p className="whitespace-pre-wrap text-sm text-[var(--text-1)]">
                {result.suggestedRecovery ?? 'No prior recovery was found.'}
              </p>
            </Card>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Past similar incidents</h3>
            {result.pastIncidents.length === 0 ? <p className="text-sm text-[var(--text-2)]">No similar incidents yet.</p> : null}
            {result.pastIncidents.map((item) => (
              <Card key={item.id} padding="p-4">
                <p className="text-sm text-[var(--text-1)]">{item.text}</p>
                <p className="mt-2 text-xs text-[var(--text-3)]">{formatRelativeTime(item.occurredAt)}</p>
              </Card>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Evidence</h3>
            {result.evidence.length === 0 ? <p className="text-sm text-[var(--text-2)]">No evidence yet.</p> : null}
            <ul className="space-y-2 text-sm">
              {result.evidence.map((item) => (
                <li key={item.id} className="border-b border-[var(--border)] py-2">
                  <p className="text-[var(--text-1)]">{item.text}</p>
                  <p className="mt-1 text-xs text-[var(--text-3)]">
                    {item.type || 'memory'}
                    {item.context ? ` · ${item.context}` : ''} · {formatRelativeTime(item.occurredAt)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
