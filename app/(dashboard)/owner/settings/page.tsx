/**
 * @file app/(dashboard)/owner/settings/page.tsx
 *
 * Owner platform settings: store bot, payments, and public info.
 * Secrets are write-only. The API never returns tokens or Binance keys.
 *
 * @module Dashboard
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES, ROUTES } from '@/lib/navigation';

type Settings = {
  readonly id: string;
  readonly ownerBotUsername: string | null;
  readonly ownerBotId: string | null;
  readonly ownerBotStatus: 'connected' | 'disconnected' | 'error';
  readonly ownerBotLastHealthAt: string | null;
  readonly platformUsdtWalletBep20: string | null;
  readonly binancePayMerchantId: string | null;
  readonly binancePayEnabled: boolean;
  readonly binancePayConfigured: boolean;
  readonly bep20Enabled: boolean;
  readonly platformName: string;
  readonly supportContact: string | null;
  readonly supportTelegram: string | null;
};

type SettingsPayload = {
  readonly success: boolean;
  readonly data?: { settings: Settings; webhookUrl?: string };
  readonly error?: { code?: string; message: string };
};

const inputClass = 'btc-input mt-1 w-full';

function relativeTime(value: string | null): string {
  if (!value) {
    return 'Never';
  }
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) {
    return 'Never';
  }
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes === 1) {
    return '1 minute ago';
  }
  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

export default function OwnerSettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [botToken, setBotToken] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.ownerSettings);
      const json = (await response.json()) as SettingsPayload;
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load settings');
        return;
      }
      setSettings(json.data.settings);
      setWebhookUrl(json.data.webhookUrl ?? '');
    } catch {
      setError('Unable to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(url: string, body?: Record<string, unknown>): Promise<SettingsPayload> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return (await response.json()) as SettingsPayload;
  }

  async function patch(url: string, body: Record<string, unknown>): Promise<SettingsPayload> {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await response.json()) as SettingsPayload;
  }

  async function connectBot(): Promise<void> {
    if (!botToken.trim()) {
      setError('Paste a bot token from BotFather');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const json = await post(API_ROUTES.ownerSettingsBotConnect, { botToken });
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to connect bot');
        return;
      }
      setBotToken('');
      setMessage('Owner bot connected');
      await load();
    } catch {
      setError('Unable to connect bot');
    } finally {
      setBusy(false);
    }
  }

  async function disconnectBot(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const json = await post(API_ROUTES.ownerSettingsBotDisconnect);
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to disconnect bot');
        return;
      }
      setMessage('Owner bot disconnected');
      await load();
    } catch {
      setError('Unable to disconnect bot');
    } finally {
      setBusy(false);
    }
  }

  async function testBot(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const json = await post(API_ROUTES.ownerSettingsBotTest);
      if (!json.success) {
        setError(json.error?.message ?? 'Bot test failed');
        return;
      }
      setMessage('Bot responded to a health check');
      await load();
    } catch {
      setError('Bot test failed');
    } finally {
      setBusy(false);
    }
  }

  async function savePayments(): Promise<void> {
    if (!settings) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const json = await patch(API_ROUTES.ownerSettingsPayments, {
        platformUsdtWalletBep20: settings.platformUsdtWalletBep20,
        binancePayMerchantId: settings.binancePayMerchantId,
        binancePayEnabled: settings.binancePayEnabled,
        bep20Enabled: settings.bep20Enabled,
        ...(apiKey ? { binancePayApiKey: apiKey } : {}),
        ...(apiSecret ? { binancePayApiSecret: apiSecret } : {}),
      });
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to save payment settings');
        return;
      }
      setSettings(json.data.settings);
      setApiKey('');
      setApiSecret('');
      setMessage('Payment settings saved');
    } catch {
      setError('Unable to save payment settings');
    } finally {
      setBusy(false);
    }
  }

  async function saveInfo(): Promise<void> {
    if (!settings) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const json = await patch(API_ROUTES.ownerSettings, {
        platformName: settings.platformName,
        supportContact: settings.supportContact,
        supportTelegram: settings.supportTelegram,
      });
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to save platform info');
        return;
      }
      setSettings(json.data.settings);
      setMessage('Platform info saved');
    } catch {
      setError('Unable to save platform info');
    } finally {
      setBusy(false);
    }
  }

  const connected = settings?.ownerBotStatus === 'connected';

  return (
    <>
      <PageHeader
        title="Settings"
        description="Bots, payments, and platform info. Changes apply immediately — no environment variable updates."
      />
      {error ? (
        <p className="mb-4 rounded-md border border-[var(--red)]/20 bg-[var(--red-soft)] px-3 py-2 text-sm text-[var(--red)]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-md border border-[var(--green)]/20 bg-[var(--green-soft)] px-3 py-2 text-sm text-[var(--green)]">
          {message}
        </p>
      ) : null}
      {loading || !settings ? (
        <p className="text-sm text-[var(--text-2)]">Loading settings…</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-lg font-medium">Owner store bot</h2>
            <p className="mt-1 text-sm text-[var(--text-2)]">This is your store bot that customers use directly.</p>
            <p className="mt-3 text-sm">
              {connected ? (
                <span className="text-[var(--green)]">● Connected as @{settings.ownerBotUsername}</span>
              ) : (
                <span className="text-[var(--text-2)]">○ Not connected</span>
              )}
            </p>
            {connected ? (
              <div className="mt-4 space-y-2 text-sm text-[var(--text-2)]">
                <p>
                  Bot: @{settings.ownerBotUsername} (ID: {settings.ownerBotId})
                </p>
                <p>Last health check: {relativeTime(settings.ownerBotLastHealthAt)}</p>
                <p className="break-all">Webhook URL: {webhookUrl}</p>
                <div className="flex gap-2 pt-2">
                  <button type="button" className="btc-btn-secondary" disabled={busy} onClick={() => void disconnectBot()}>
                    Disconnect bot
                  </button>
                  <button type="button" className="btc-btn-primary" disabled={busy} onClick={() => void testBot()}>
                    Test bot
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-sm font-medium">How to get a token</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--text-2)]">
                  <li>Open Telegram and message @BotFather</li>
                  <li>Send /newbot and follow the steps</li>
                  <li>Copy the token and paste it below</li>
                </ol>
                <label className="mt-4 block text-sm text-[var(--text-2)]">
                  Bot token
                  <input
                    type="password"
                    className={inputClass}
                    value={botToken}
                    autoComplete="off"
                    onChange={(event) => setBotToken(event.target.value)}
                  />
                </label>
                <button type="button" className="btc-btn-primary mt-3" disabled={busy} onClick={() => void connectBot()}>
                  Connect bot
                </button>
              </div>
            )}
          </section>

          <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-lg font-medium">Payment methods</h2>
            <p className="mt-1 text-sm text-[var(--text-2)]">Configure how customers pay for orders.</p>
            <h3 className="mt-4 text-sm font-medium">USDT BEP20</h3>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.bep20Enabled}
                onChange={(event) => setSettings({ ...settings, bep20Enabled: event.target.checked })}
              />
              Enabled
            </label>
            <label className="mt-3 block text-sm text-[var(--text-2)]">
              Your USDT wallet address (BEP20)
              <input
                className={inputClass}
                value={settings.platformUsdtWalletBep20 ?? ''}
                placeholder="0x..."
                onChange={(event) => setSettings({ ...settings, platformUsdtWalletBep20: event.target.value })}
              />
            </label>
            <p className="mt-1 text-sm text-[var(--text-3)]">Customers send USDT to this address.</p>

            <h3 className="mt-6 text-sm font-medium">Binance Pay</h3>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.binancePayEnabled}
                onChange={(event) => setSettings({ ...settings, binancePayEnabled: event.target.checked })}
              />
              Enabled
            </label>
            <label className="mt-3 block text-sm text-[var(--text-2)]">
              Merchant ID
              <input
                className={inputClass}
                value={settings.binancePayMerchantId ?? ''}
                onChange={(event) => setSettings({ ...settings, binancePayMerchantId: event.target.value })}
              />
            </label>
            <label className="mt-3 block text-sm text-[var(--text-2)]">
              API key
              <input
                type="password"
                className={inputClass}
                value={apiKey}
                autoComplete="off"
                placeholder={settings.binancePayConfigured ? '••••••••' : ''}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm text-[var(--text-2)]">
              API secret
              <input
                type="password"
                className={inputClass}
                value={apiSecret}
                autoComplete="off"
                placeholder={settings.binancePayConfigured ? '••••••••' : ''}
                onChange={(event) => setApiSecret(event.target.value)}
              />
            </label>
            <p className={`mt-2 text-sm ${settings.binancePayConfigured ? 'text-[var(--green)]' : 'text-[var(--text-2)]'}`}>
              Status: {settings.binancePayConfigured ? '● Configured' : '○ Not configured'}
            </p>
            <button type="button" className="btc-btn-primary mt-3" disabled={busy} onClick={() => void savePayments()}>
              Save payment settings
            </button>
          </section>

          <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-lg font-medium">Platform info</h2>
            <label className="mt-3 block text-sm text-[var(--text-2)]">
              Platform name
              <input
                className={inputClass}
                value={settings.platformName}
                onChange={(event) => setSettings({ ...settings, platformName: event.target.value })}
              />
            </label>
            <label className="mt-3 block text-sm text-[var(--text-2)]">
              Support contact
              <input
                className={inputClass}
                value={settings.supportContact ?? ''}
                onChange={(event) => setSettings({ ...settings, supportContact: event.target.value })}
              />
            </label>
            <label className="mt-3 block text-sm text-[var(--text-2)]">
              Support Telegram
              <input
                className={inputClass}
                value={settings.supportTelegram ?? ''}
                placeholder="t.me/..."
                onChange={(event) => setSettings({ ...settings, supportTelegram: event.target.value })}
              />
            </label>
            <button type="button" className="btc-btn-primary mt-3" disabled={busy} onClick={() => void saveInfo()}>
              Save info
            </button>
          </section>

          <Link href={ROUTES.public.apiDocs} className="inline-flex text-sm text-[var(--accent)] hover:underline">
            Open API documentation
          </Link>
        </div>
      )}
    </>
  );
}
