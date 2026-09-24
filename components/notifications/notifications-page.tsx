/**
 * @file components/notifications/notifications-page.tsx
 *
 * Full notification inbox grouped by day.
 *
 * @module Components
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import type { NotificationItem } from '@/modules/notifications';

const FILTERS = ['all', 'orders', 'wallet', 'system'] as const;

function groupLabel(iso: string): string {
  const date = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = (start.getTime() - day.getTime()) / 86400000;
  if (diff < 1) {
    return 'Today';
  }
  if (diff < 2) {
    return 'Yesterday';
  }
  if (diff < 7) {
    return 'This week';
  }
  return 'Older';
}

/**
 * Lists, filters, and bulk-updates notifications.
 */
export function NotificationsPage(): JSX.Element {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async (): Promise<void> => {
    const response = await fetch(`/api/notifications?filter=${filter}`);
    const json = (await response.json()) as { success?: boolean; data?: { items?: NotificationItem[] } };
    setItems(json.success ? json.data?.items ?? [] : []);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAll(): Promise<void> {
    await fetch('/api/notifications/read-all', { method: 'PATCH' });
    await load();
  }

  async function markOne(id: string): Promise<void> {
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    await load();
  }

  async function markSelected(): Promise<void> {
    await Promise.all(selected.map((id) => fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })));
    setSelected([]);
    await load();
  }

  async function deleteSelected(): Promise<void> {
    await Promise.all(selected.map((id) => fetch(`/api/notifications/${id}`, { method: 'DELETE' })));
    setSelected([]);
    await load();
  }

  const groups = items.reduce<Record<string, NotificationItem[]>>((bucket, item) => {
    const label = groupLabel(item.createdAt);
    bucket[label] = [...(bucket[label] ?? []), item];
    return bucket;
  }, {});

  return (
    <div>
      <PageHeader title="Notifications" description="Orders, wallet changes, and platform updates." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={`min-h-11 rounded-full px-3 text-sm capitalize ${filter === item ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-raised)] text-[var(--text-2)]'}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
        <button type="button" className="min-h-11 text-sm text-[var(--accent-soft)]" onClick={() => void markAll()}>
          Mark all as read
        </button>
        {selected.length > 0 ? (
          <>
            <button type="button" className="min-h-11 text-sm text-[var(--text-1)]" onClick={() => void markSelected()}>
              Mark selected as read
            </button>
            <button type="button" className="min-h-11 text-sm text-[var(--red)]" onClick={() => void deleteSelected()}>
              Delete selected
            </button>
          </>
        ) : null}
      </div>
      {items.length === 0 ? <p className="text-sm text-[var(--text-2)]">No notifications yet.</p> : null}
      {Object.entries(groups).map(([label, rows]) => (
        <section key={label} className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-[var(--text-2)]">{label}</h2>
          <ul className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)]">
            {rows.map((item) => (
              <li key={item.id} className={`flex items-start gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0 ${item.isRead ? '' : 'border-l-2 border-l-[var(--accent)]'}`}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={selected.includes(item.id)}
                  aria-label={`Select ${item.title}`}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
                    )
                  }
                />
                <button type="button" className="min-h-11 flex-1 text-left" onClick={() => void markOne(item.id)}>
                  <span className="block text-sm text-[var(--text-1)]">{item.title}</span>
                  <span className="block text-sm text-[var(--text-2)]">{item.body}</span>
                  <span className="text-xs text-[var(--text-3)]">{item.isRead ? 'Read' : 'Unread'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
