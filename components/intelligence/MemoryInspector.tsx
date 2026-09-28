/**
 * @file components/intelligence/MemoryInspector.tsx
 *
 * Modal that shows the memories behind a recommendation.
 *
 * @module Components
 */

'use client';

import { useEffect } from 'react';
import { formatRelativeTime } from '@/lib/relative-time';
import type { IntelligenceMemory } from '@/components/intelligence/types';

type MemoryInspectorProps = {
  readonly evidence: readonly IntelligenceMemory[];
  readonly recommendation: string;
  readonly onClose: () => void;
};

export function MemoryInspector({ evidence, recommendation, onClose }: MemoryInspectorProps): JSX.Element {
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-inspector-title"
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-page)] p-5 shadow-[var(--shadow-card)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="memory-inspector-title" className="text-lg font-semibold text-[var(--text-1)]">
          Why this recommendation?
        </h2>
        <p className="mt-3 text-base font-semibold leading-relaxed text-[var(--text-1)]">{recommendation}</p>
        <h3 className="mt-5 text-sm font-semibold text-[var(--text-1)]">Evidence from memory</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {evidence.length === 0 ? <li className="text-[var(--text-2)]">No evidence was returned.</li> : null}
          {evidence.map((item) => (
            <li key={item.id} className="border-b border-[var(--border)] py-2">
              <p className="text-[var(--text-1)]">{item.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-2)]">
                <span className="rounded-full bg-[var(--bg-raised)] px-2 py-0.5 uppercase tracking-wide text-[var(--text-2)]">
                  {item.type || 'memory'}
                </span>
                {item.context ? <span>{item.context}</span> : null}
                <span>{formatRelativeTime(item.occurredAt)}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-[var(--text-3)]">Powered by Hindsight</p>
          <button type="button" className="text-sm text-[var(--accent-soft)]" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
