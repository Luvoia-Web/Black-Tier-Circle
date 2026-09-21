/**
 * @file app/(dashboard)/owner/launch/page.tsx
 *
 * Owner launch-readiness checklist with live system checks.
 *
 * @module Dashboard
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, TableSkeleton } from '@/components/ui/fetch-states';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES } from '@/lib/navigation';
import type { LaunchCheck } from '@/modules/launch';

const GROUPS: ReadonlyArray<LaunchCheck['group']> = ['environment', 'payment', 'bot', 'product', 'reseller'];

export default function OwnerLaunchPage(): JSX.Element {
  const [items, setItems] = useState<LaunchCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.ownerLaunch);
      const json = (await response.json()) as {
        success: boolean;
        data?: { items: LaunchCheck[] };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load checklist');
        return;
      }
      setItems(json.data.items);
    } catch {
      setError('Unable to load checklist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const passingCount = items.filter((item) => item.passing).length;
  const isReady = items.length > 0 && passingCount === items.length;

  return (
    <>
      <PageHeader
        title="Launch Readiness"
        description="Production readiness. Green items pass; red items must be fixed before go-live."
        actions={
          <div className="flex items-center gap-3">
            {items.length > 0 ? (
              <Badge variant={isReady ? 'success' : 'warning'}>{isReady ? 'Ready' : 'Needs work'}</Badge>
            ) : null}
            <button type="button" onClick={() => void load()} className="btc-btn-primary">
              Re-check
            </button>
          </div>
        }
      />
      {items.length > 0 ? (
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-2)]">
            <span>
              {passingCount}/{items.length} checks passing
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-raised)]">
            <div
              className="h-full rounded-full bg-[var(--green)]"
              style={{ width: `${items.length === 0 ? 0 : Math.round((passingCount / items.length) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <TableSkeleton rows={8} />
      ) : (
        GROUPS.map((group) => (
          <section key={group} className="mb-6 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)]">
            <h2 className="border-b border-[var(--border)] px-4 py-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-3)]">
              {group}
            </h2>
            <ul>
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between border-b border-[var(--border)] px-4 py-3 last:border-0"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          item.passing ? 'bg-[var(--green)]' : 'bg-[var(--red)]'
                        }`}
                      />
                      <div>
                        <p className="text-sm text-[var(--text-1)]">{item.label}</p>
                        <p className="text-xs text-[var(--text-3)]">{item.detail}</p>
                      </div>
                    </div>
                    <span className={item.passing ? 'text-[var(--green)]' : 'text-[var(--red)]'}>
                      {item.passing ? '✓' : '✕'}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
