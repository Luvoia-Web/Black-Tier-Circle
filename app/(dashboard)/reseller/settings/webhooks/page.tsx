/**
 * @file app/(dashboard)/reseller/settings/webhooks/page.tsx
 *
 * Reseller webhook endpoint management.
 *
 * @module Dashboard
 */

'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { API_CONFIG } from '@/lib/api-config';
import { API_ROUTES } from '@/lib/navigation';
import type { WebhookEvent } from '@/modules/public-api/types';

type WebhookRow = {
  readonly id: string;
  readonly url: string;
  readonly events: WebhookEvent[];
  readonly isActive: boolean;
  readonly failureCount: number;
  readonly lastTriggeredAt: string | null;
  readonly secretPrefix: string;
};

const inputClass =
  'rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/…`;
  } catch {
    return 'https://…';
  }
}

/**
 * Lists, creates, toggles, and deletes outbound webhook endpoints.
 */
export default function ResellerWebhooksPage(): JSX.Element {
  const [rows, setRows] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['order.payment_verified', 'order.fulfilled']);
  const [rawSecret, setRawSecret] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.resellerWebhooks);
      const json = (await response.json()) as {
        success: boolean;
        data?: { webhooks: WebhookRow[] };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load webhooks');
        return;
      }
      setRows(json.data.webhooks);
    } catch {
      setError('Unable to load webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleEvent(event: WebhookEvent): void {
    setEvents((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event],
    );
  }

  async function createWebhook(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.resellerWebhooks, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, events }),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: { rawSecret: string };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to add webhook');
        return;
      }
      setRawSecret(json.data.rawSecret);
      setShowForm(false);
      setUrl('');
      await load();
    } catch {
      setError('Unable to add webhook');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: WebhookRow): Promise<void> {
    await fetch(API_ROUTES.resellerWebhook(row.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !row.isActive }),
    });
    await load();
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm('Delete this webhook endpoint?')) {
      return;
    }
    await fetch(API_ROUTES.resellerWebhook(id), { method: 'DELETE' });
    await load();
  }

  const columns: ReadonlyArray<DataTableColumn<WebhookRow>> = [
    { key: 'url', header: 'URL', render: (row) => maskUrl(row.url) },
    { key: 'events', header: 'Events', render: (row) => row.events.join(', ') },
    { key: 'status', header: 'Status', render: (row) => (row.isActive ? 'Active' : 'Inactive') },
    {
      key: 'triggered',
      header: 'Last triggered',
      render: (row) => (row.lastTriggeredAt ? new Date(row.lastTriggeredAt).toLocaleString() : 'Never'),
    },
    { key: 'failures', header: 'Failures', render: (row) => String(row.failureCount) },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex gap-3">
          <button type="button" className="text-sm text-indigo-400" onClick={() => void toggleActive(row)}>
            {row.isActive ? 'Disable' : 'Enable'}
          </button>
          <button type="button" className="text-sm text-red-400" onClick={() => void remove(row.id)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Receive signed POSTs when orders change."
        actions={
          <button
            type="button"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={() => setShowForm(true)}
          >
            Add Webhook
          </button>
        }
      />
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {rawSecret ? (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-200">
            This key will only be shown once. Copy it now and store it securely.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-gray-950 p-3 text-sm text-gray-100">{rawSecret}</pre>
        </div>
      ) : null}
      {showForm ? (
        <form onSubmit={(event) => void createWebhook(event)} className="mb-6 space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <label className="block text-sm">
            URL (https:// required)
            <input
              className={`${inputClass} mt-1 w-full`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/btc"
              required
            />
          </label>
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 text-gray-400">Events</legend>
            {API_CONFIG.webhooks.events.map((eventName) => (
              <label key={eventName} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={events.includes(eventName)}
                  onChange={() => toggleEvent(eventName)}
                />
                {eventName}
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add webhook'}
            </button>
            <button type="button" className="text-sm text-gray-400" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyMessage="No webhook endpoints yet. Add an HTTPS URL to receive order events."
        />
      )}
    </>
  );
}
