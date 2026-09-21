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

type PageError = {
  readonly code: string;
  readonly message: string;
};

type ApiErrorBody = {
  readonly success: boolean;
  readonly data?: BotStatus;
  readonly error?: { code?: string; message: string };
};

const inputClass =
  'rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]';

function statusClass(status: string): string {
  if (status === 'connected') {
    return 'bg-[var(--green-soft)] text-[var(--green)]';
  }
  if (status === 'error') {
    return 'bg-[var(--red-soft)] text-[var(--red)]';
  }
  return 'bg-[var(--bg-raised)] text-[var(--text-2)]';
}

function toPageError(payload: ApiErrorBody['error'], fallbackCode: string, fallbackMessage: string): PageError {
  return {
    code: payload?.code ?? fallbackCode,
    message: payload?.message ?? fallbackMessage,
  };
}

/**
 * Amber warning shown when Telegram cannot reach localhost.
 */
function WebhookUrlNotPublicWarning(): JSX.Element {
  return (
    <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <span className="text-lg text-amber-400">⚠️</span>
        <div>
          <p className="text-sm font-medium text-amber-400">Public URL required</p>
          <p className="mt-1 text-sm text-amber-400/80">
            Telegram needs a public HTTPS URL to connect your bot.
          </p>
          <div className="mt-3 rounded-lg bg-black/30 p-3 font-mono text-xs text-amber-300">
            <p className="mb-1 text-amber-400/60"># In a new terminal:</p>
            <p>npm run tunnel</p>
            <p className="mb-1 mt-2 text-amber-400/60"># Then restart:</p>
            <p>npm run dev</p>
          </div>
          <p className="mt-2 text-xs text-amber-400/60">
            The tunnel script updates your .env.local automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * BotFather setup steps shown when no bot is connected.
 */
function BotConnectInstructions(): JSX.Element {
  return (
    <div className="mb-4 mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-raised)] p-5">
      <h3 className="mb-3 text-sm font-medium text-[var(--text-1)]">How to connect your bot</h3>
      <ol className="space-y-2 text-sm text-[var(--text-2)]">
        <li className="flex gap-2">
          <span className="font-mono text-[var(--accent)]">1.</span>
          Open Telegram and message <span className="font-mono text-[var(--text-1)]">@BotFather</span>
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-[var(--accent)]">2.</span>
          Send <span className="font-mono text-[var(--text-1)]">/newbot</span> and follow the steps
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-[var(--accent)]">3.</span>
          Copy the token BotFather gives you (looks like{' '}
          <span className="font-mono text-[var(--text-1)]">123456:ABC...</span>)
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-[var(--accent)]">4.</span>
          For local testing: run <span className="font-mono text-[var(--text-1)]">npm run tunnel</span> first
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-[var(--accent)]">5.</span>
          Paste the token below and click Connect
        </li>
      </ol>
    </div>
  );
}

/**
 * Connect or disconnect the reseller Telegram bot.
 */
export default function ResellerBotPage(): JSX.Element {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PageError | null>(null);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.botsStatus);
      const json = (await response.json()) as ApiErrorBody;
      if (!json.success || !json.data) {
        setError(toPageError(json.error, 'BOT_STATUS_FAILED', 'Unable to load bot status'));
        setStatus(null);
        return;
      }
      setStatus(json.data);
    } catch {
      setError({ code: 'BOT_STATUS_FAILED', message: 'Unable to load bot status' });
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
      const json = (await response.json()) as ApiErrorBody;
      setToken('');
      if (!json.success) {
        setError(toPageError(json.error, 'BOT_CONNECT_FAILED', 'Unable to connect bot'));
        return;
      }
      await load();
    } catch {
      setError({ code: 'BOT_CONNECT_FAILED', message: 'Unable to connect bot' });
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
      const json = (await response.json()) as ApiErrorBody;
      if (!json.success) {
        setError(toPageError(json.error, 'BOT_DISCONNECT_FAILED', 'Unable to disconnect bot'));
        return;
      }
      await load();
    } catch {
      setError({ code: 'BOT_DISCONNECT_FAILED', message: 'Unable to disconnect bot' });
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
      {error?.code === 'WEBHOOK_URL_NOT_PUBLIC' ? (
        <WebhookUrlNotPublicWarning />
      ) : error ? (
        <p className="mb-4 rounded-md border border-[var(--red)]/20 bg-[var(--red-soft)] px-3 py-2 text-sm text-[var(--red)]">
          {error.message}
        </p>
      ) : null}
      {loading || status === null ? (
        <p className="text-sm text-[var(--text-2)]">Loading bot status…</p>
      ) : status.pending ? (
        <div className="rounded-lg border border-[var(--amber)]/20 bg-[var(--amber-soft)] px-6 py-8">
          <h2 className="text-lg font-semibold text-[var(--amber)]">Account pending activation</h2>
          <p className="mt-2 text-sm text-[var(--text-2)]">
            Your account must be activated by the owner before you can connect a bot.
          </p>
        </div>
      ) : connected ? (
        <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-[var(--text-1)]">@{status.username}</p>
              <p className="text-sm text-[var(--text-2)]">Telegram Bot ID {status.telegramBotId}</p>
            </div>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusClass(status.status ?? 'connected')}`}
            >
              {status.status ?? 'connected'}
            </span>
          </div>
          <p className="text-sm text-[var(--text-2)]">
            Last health check:{' '}
            {status.lastHealthAt ? new Date(status.lastHealthAt).toLocaleString() : 'Not yet'}
          </p>
          <p className="text-sm text-[var(--text-2)]">Customers: {status.customerCount ?? 0}</p>
          <label className="flex flex-col gap-1 text-sm text-[var(--text-2)]">
            Webhook URL
            <div className="flex gap-2">
              <input readOnly value={status.webhookUrl ?? ''} className={`${inputClass} flex-1`} />
              <button
                type="button"
                onClick={() => void copyWebhook()}
                className="rounded-md border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-1)]"
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
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-1)]">Connect your Telegram bot to start selling</h2>
          <BotConnectInstructions />
          <form onSubmit={(event) => void connect(event)} className="mt-6 space-y-4">
            <label className="flex flex-col gap-1 text-sm text-[var(--text-2)]">
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
            <p className="text-xs text-[var(--amber)]">
              Your bot token is encrypted and stored securely. It cannot be retrieved after connection.
            </p>
            <button
              type="submit"
              disabled={saving || token.length === 0}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-soft)] disabled:opacity-60"
            >
              {saving ? 'Connecting…' : 'Connect Bot'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
