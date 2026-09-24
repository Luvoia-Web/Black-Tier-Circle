/**
 * @file components/settings/owner-platform-panels.tsx
 *
 * Platform webhooks, maintenance, and data export for the owner settings page.
 *
 * @module Components
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, PauseCircle, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';
import { SettingsCard } from '@/components/settings/SettingsCard';

type WebhookRow = {
  readonly id: string;
  readonly url: string;
  readonly events: string[];
  readonly isActive: boolean;
  readonly secretPrefix: string;
};

const EVENTS = ['order.paid', 'order.delivered', 'reseller.activated'] as const;

/**
 * Owner-only webhook list, pause control, and CSV export.
 */
export function OwnerPlatformPanels(): JSX.Element {
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['order.paid']);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pausing, setPausing] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const response = await fetch('/api/owner/webhooks');
    const json = (await response.json()) as { success?: boolean; data?: { webhooks?: WebhookRow[] } };
    if (json.success && json.data?.webhooks) {
      setWebhooks(json.data.webhooks);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveWebhook(): Promise<void> {
    if (!url.startsWith('https://') || events.length === 0) {
      toast.error('Use an HTTPS URL and at least one event');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/owner/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, events }),
      });
      const json = (await response.json()) as { success?: boolean; data?: { secret?: string }; error?: { message?: string } };
      if (!response.ok || !json.success || !json.data?.secret) {
        toast.error(json.error?.message ?? 'Unable to save webhook');
        return;
      }
      setSecret(json.data.secret);
      setOpen(false);
      setUrl('');
      toast.success('Webhook saved');
      await load();
    } catch {
      toast.error('Unable to save webhook');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    const response = await fetch('/api/owner/webhooks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      toast.error('Unable to delete webhook');
      return;
    }
    toast.success('Webhook deleted');
    await load();
  }

  async function setMaintenance(maintenance: boolean): Promise<void> {
    setPausing(true);
    try {
      const response = await fetch('/api/owner/platform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maintenance }),
      });
      const json = (await response.json()) as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !json.success) {
        toast.error(json.error?.message ?? 'Unable to update platform status');
        return;
      }
      toast.success(maintenance ? 'Platform paused' : 'Platform resumed');
    } catch {
      toast.error('Unable to update platform status');
    } finally {
      setPausing(false);
    }
  }

  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
      <SettingsCard
        icon={<Webhook size={18} />}
        title="Webhook endpoints"
        description="Send notifications to your systems when events happen"
      >
        <ul className="space-y-3">
          {webhooks.length === 0 ? <li className="text-sm text-[var(--text-2)]">No webhooks yet.</li> : null}
          {webhooks.map((hook) => (
            <li key={hook.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 break-all text-[var(--text-1)]">{hook.url}</span>
              <span className="text-[var(--text-3)]">{hook.events.join(', ')}</span>
              <span className={hook.isActive ? 'text-[var(--green)]' : 'text-[var(--text-3)]'}>
                {hook.isActive ? 'Active' : 'Inactive'}
              </span>
              <button type="button" className="min-h-11 text-[var(--red)]" onClick={() => void remove(hook.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btc-btn-primary mt-4" onClick={() => setOpen(true)}>
          Add webhook
        </button>
        {secret ? (
          <p className="mt-3 text-sm text-[var(--text-2)]">
            Secret (shown once): <code className="text-[var(--text-1)]">{secret}</code>{' '}
            <button type="button" className="min-h-11 text-[var(--accent-soft)]" onClick={() => void copyToClipboard(secret)}>
              Copy
            </button>
          </p>
        ) : null}
        {open ? (
          <div className="mt-4 space-y-3 rounded-[var(--r-md)] border border-[var(--border)] p-3" role="dialog" aria-label="Add webhook">
            <label className="block text-sm text-[var(--text-2)]" htmlFor="owner-webhook-url">
              URL
              <input id="owner-webhook-url" className="btc-input mt-1 w-full" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm text-[var(--text-2)]">Events</legend>
              {EVENTS.map((event) => (
                <label key={event} className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-1)]">
                  <input
                    type="checkbox"
                    checked={events.includes(event)}
                    onChange={() =>
                      setEvents((current) =>
                        current.includes(event) ? current.filter((item) => item !== event) : [...current, event],
                      )
                    }
                  />
                  {event}
                </label>
              ))}
            </fieldset>
            <button type="button" className="btc-btn-primary" disabled={busy} onClick={() => void saveWebhook()}>
              {busy ? 'Saving…' : 'Save webhook'}
            </button>
          </div>
        ) : null}
      </SettingsCard>

      <SettingsCard icon={<PauseCircle size={18} />} title="Danger zone" description="Platform-wide controls.">
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btc-btn-primary" disabled={pausing} onClick={() => void setMaintenance(true)}>
            {pausing ? 'Working…' : 'Pause platform'}
          </button>
          <button type="button" className="min-h-11 rounded-[var(--r-md)] border border-[var(--border)] px-4 text-sm" disabled={pausing} onClick={() => void setMaintenance(false)}>
            Resume platform
          </button>
          <a className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--accent-soft)]" href="/api/owner/platform">
            <Download size={16} aria-hidden="true" />
            Export all data
          </a>
        </div>
      </SettingsCard>
    </div>
  );
}
