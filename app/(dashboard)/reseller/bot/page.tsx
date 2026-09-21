/**
 * @file app/(dashboard)/reseller/bot/page.tsx
 *
 * Reseller Telegram bot connection management.
 *
 * @module Dashboard
 */

'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES } from '@/lib/navigation';

type BotStatus = {
  readonly connected: boolean;
  readonly pending?: boolean;
  readonly username?: string;
  readonly telegramBotId?: string;
  readonly status?: 'connected' | 'disconnected' | 'error';
  readonly lastHealthAt?: string | null;
  readonly webhookUrl?: string;
  readonly customerCount?: number;
  readonly connectedAt?: string;
};

const inputClass =
  'rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';

function statusClass(status: string): string {
  if (status === 'connected') {
    return 'bg-emerald-500/10 text-emerald-400';
  }
  if (status === 'error') {
    return 'bg-red-500/10 text-red-400';
  }
  return 'bg-gray-500/10 text-gray-400';
}

/**
 * Connect or disconnect the reseller Telegram bot.
 */
export default function ResellerBotPage(): JSX.Element {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.botsStatus);
      const json = (await response.json()) as {
        success: boolean;
        data?: BotStatus;
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load bot status');
        setStatus(null);
        return;
      }
      setStatus(json.data);
    } catch {
      setError('Unable to load bot status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.botsConnect, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: token }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      setToken('');
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to connect bot');
        return;
      }
      await load();
    } catch {
      setError('Unable to connect bot');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(): Promise<void> {
    if (
      !window.confirm(
        "This will stop your bot from working. Customers won't be able to place orders.",
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.botsDisconnect, { method: 'POST' });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to disconnect bot');
        return;
      }
      await load();
    } catch {
      setError('Unable to disconnect bot');
    } finally {
      setSaving(false);
    }
  }

  async function copyWebhook(): Promise<void> {
    if (!status?.webhookUrl) {
      return;
    }
    await navigator.clipboard.writeText(status.webhookUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const connected = status?.connected === true && status.pending !== true;

  return (
    <>
      <PageHeader
        title="My Bot"
        description="Connect your Telegram bot so customers can browse and buy"
      />
      {error ? (
        <p className="mb-4 rounded-md border border-red-600/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}
      {loading || status === null ? (
        <p className="text-sm text-gray-400">Loading bot status…</p>
      ) : status.pending ? (
        <div className="rounded-lg border border-yellow-600/30 bg-yellow-500/10 px-6 py-8">
          <h2 className="text-lg font-semibold text-yellow-300">Account pending activation</h2>
          <p className="mt-2 text-sm text-gray-300">
            Your account must be activated by the owner before you can connect a bot.
          </p>
        </div>
      ) : connected ? (
        <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-gray-100">@{status.username}</p>
              <p className="text-sm text-gray-400">Telegram Bot ID {status.telegramBotId}</p>
            </div>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusClass(status.status ?? 'connected')}`}
            >
              {status.status ?? 'connected'}
            </span>
          </div>
          <p className="text-sm text-gray-400">
            Last health check:{' '}
            {status.lastHealthAt ? new Date(status.lastHealthAt).toLocaleString() : 'Not yet'}
          </p>
          <p className="text-sm text-gray-400">Customers: {status.customerCount ?? 0}</p>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Webhook URL
            <div className="flex gap-2">
              <input readOnly value={status.webhookUrl ?? ''} className={`${inputClass} flex-1`} />
              <button
                type="button"
                onClick={() => void copyWebhook()}
                className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void disconnect()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
          >
            Disconnect Bot
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-gray-100">Connect your Telegram bot to start selling</h2>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-gray-300">
            <li>Create a bot with @BotFather</li>
            <li>Copy the token</li>
            <li>Paste below</li>
          </ol>
          <form onSubmit={(event) => void connect(event)} className="mt-6 space-y-4">
            <label className="flex flex-col gap-1 text-sm text-gray-400">
              Bot token
              <input
                required
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                className={inputClass}
              />
            </label>
            <p className="text-xs text-yellow-400">
              Your bot token is encrypted and stored securely. It cannot be retrieved after connection.
            </p>
            <button
              type="submit"
              disabled={saving || token.length === 0}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? 'Connecting…' : 'Connect Bot'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
