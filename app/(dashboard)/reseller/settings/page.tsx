/**
 * @file app/(dashboard)/reseller/settings/page.tsx
 *
 * Full reseller store settings: bot, store, payments, Binance, support, terms.
 *
 * @module Dashboard
 */

'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ErrorState, TableSkeleton } from '@/components/ui/fetch-states';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES, ROUTES } from '@/lib/navigation';

type Settings = {
  readonly storeName: string | null;
  readonly storeStatus: 'open' | 'maintenance';
  readonly maintenanceMsg: string | null;
  readonly supportContact: string | null;
  readonly supportChatUrl: string | null;
  readonly supportPhone: string | null;
  readonly supportMessage: string | null;
  readonly termsOfService: string | null;
  readonly refundPolicy: string | null;
  readonly privacyPolicy: string | null;
  readonly binanceMerchantUid: string | null;
  readonly binancePayConfigured: boolean;
  readonly binancePayEnabled: boolean;
  readonly useOwnUsdtWallet: boolean;
  readonly usdtWalletBep20: string | null;
  readonly usdtMinimumBep20: string;
  readonly resellerSignupEnabled: boolean;
  readonly resellerSignupMessage: string | null;
};

type BotStatus = {
  readonly connected?: boolean;
  readonly username?: string;
  readonly status?: string;
};

const inputClass = 'btc-input';

export default function ResellerSettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [bot, setBot] = useState<BotStatus | null>(null);
  const [token, setToken] = useState('');
  const [binanceKey, setBinanceKey] = useState('');
  const [binanceSecret, setBinanceSecret] = useState('');
  const [useOwnWallet, setUseOwnWallet] = useState(false);
  const [binanceEnabled, setBinanceEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, botRes] = await Promise.all([
        fetch(API_ROUTES.resellerSettings),
        fetch(API_ROUTES.botsStatus),
      ]);
      const settingsJson = (await settingsRes.json()) as {
        success: boolean;
        data?: { settings: Settings; tenant: { displayName: string } };
        error?: { message: string };
      };
      const botJson = (await botRes.json()) as { success: boolean; data?: BotStatus };
      if (!settingsJson.success || !settingsJson.data) {
        setError(settingsJson.error?.message ?? 'Unable to load settings');
        return;
      }
      setSettings({
        ...settingsJson.data.settings,
        storeName: settingsJson.data.settings.storeName ?? settingsJson.data.tenant.displayName,
      });
      setUseOwnWallet(settingsJson.data.settings.useOwnUsdtWallet === true);
      setBinanceEnabled(settingsJson.data.settings.binancePayEnabled === true);
      if (botJson.success) {
        setBot(botJson.data ?? null);
      }
    } catch {
      setError('Unable to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>, ok: string): Promise<void> {
    setMessage(null);
    const response = await fetch(API_ROUTES.resellerSettings, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      setError(json.error?.message ?? 'Unable to save');
      return;
    }
    setMessage(ok);
    await load();
  }

  async function connectBot(event: FormEvent): Promise<void> {
    event.preventDefault();
    const response = await fetch(API_ROUTES.botsConnect, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: token }),
    });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      setError(json.error?.message ?? 'Unable to connect bot');
      return;
    }
    setToken('');
    await load();
  }

  async function disconnectBot(): Promise<void> {
    await fetch(API_ROUTES.botsDisconnect, { method: 'POST' });
    await load();
  }

  if (loading && settings === null) {
    return <TableSkeleton />;
  }
  if (error && settings === null) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }
  if (settings === null) {
    return <ErrorState message="Unable to load settings" onRetry={() => void load()} />;
  }

  const connected = bot?.connected === true || bot?.status === 'connected';

  return (
    <>
      <PageHeader title="Settings" description="Store, bot, payments, and policies" />
      {error ? <p className="mb-3 text-sm text-[var(--red)]">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-[var(--green)]">{message}</p> : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-medium">Telegram bot</h2>
        <p className={`mt-2 text-sm ${connected ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
          {connected ? `Connected as @${bot?.username ?? 'bot'}` : 'Not connected'}
        </p>
        <form onSubmit={(event) => void connectBot(event)} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Bot token"
            className={inputClass}
          />
          <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white">
            Connect
          </button>
          <button type="button" onClick={() => void disconnectBot()} className="rounded-md border border-[var(--border-soft)] px-3 py-2 text-sm">
            Disconnect
          </button>
        </form>
        <button type="button" className="mt-2 text-xs text-[var(--accent-soft)]" onClick={() => void load()}>
          Refresh bot status
        </button>
      </section>

      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-medium">Store name</h2>
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            value={settings.storeName ?? ''}
            onChange={(event) => setSettings({ ...settings, storeName: event.target.value })}
          />
          <button
            type="button"
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
            onClick={() => void patch({ storeName: settings.storeName }, 'Name saved')}
          >
            Save name
          </button>
        </div>
      </section>

      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-medium">Store status</h2>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.storeStatus === 'maintenance'}
            onChange={(event) =>
              setSettings({ ...settings, storeStatus: event.target.checked ? 'maintenance' : 'open' })
            }
          />
          Store in maintenance
        </label>
        <textarea
          className={`${inputClass} mt-3`}
          rows={3}
          value={settings.maintenanceMsg ?? ''}
          onChange={(event) => setSettings({ ...settings, maintenanceMsg: event.target.value })}
          placeholder="Custom maintenance message"
        />
        <button
          type="button"
          className="mt-3 rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
          onClick={() =>
            void patch(
              { storeStatus: settings.storeStatus, maintenanceMsg: settings.maintenanceMsg },
              'Message saved',
            )
          }
        >
          Save message
        </button>
      </section>

      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-medium">API payment mode</h2>
        <p className="mt-2 text-sm text-[var(--green)]">Credit (wallet) — purchases deduct from buyer credit</p>
        <p className="mt-1 text-sm text-[var(--text-3)]">Bill on account — coming soon</p>
      </section>

      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-medium">Payment methods for your bot</h2>
        <p className="mt-1 text-sm text-[var(--text-2)]">These settings control how your customers pay on your bot.</p>
        <h3 className="mt-4 text-sm font-medium">Your USDT wallet (BEP20)</h3>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useOwnWallet} onChange={(event) => setUseOwnWallet(event.target.checked)} />
          Use my own wallet
        </label>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          {useOwnWallet
            ? 'Customers send USDT to your address.'
            : 'Customers use the platform wallet when you leave this off.'}
        </p>
        {useOwnWallet ? (
          <label className="mt-3 block text-sm text-[var(--text-2)]">
            Address
            <input
              className={`${inputClass} mt-1`}
              value={settings.usdtWalletBep20 ?? ''}
              onChange={(event) => setSettings({ ...settings, usdtWalletBep20: event.target.value })}
              placeholder="0x..."
            />
          </label>
        ) : null}
        <label className="mt-3 block text-sm text-[var(--text-2)]">
          USDT minimum (BEP20)
          <input
            className={`${inputClass} mt-1`}
            value={settings.usdtMinimumBep20}
            onChange={(event) => setSettings({ ...settings, usdtMinimumBep20: event.target.value })}
          />
        </label>
        <button
          type="button"
          className="mt-3 rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
          onClick={() =>
            void patch(
              {
                useOwnUsdtWallet: useOwnWallet,
                usdtWalletBep20: settings.usdtWalletBep20,
                usdtMinimumBep20: settings.usdtMinimumBep20,
              },
              'Payment settings saved',
            )
          }
        >
          Save payment settings
        </button>
      </section>

      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-medium">Binance Pay</h2>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={binanceEnabled}
            onChange={(event) => setBinanceEnabled(event.target.checked)}
          />
          Enable Binance Pay on my bot
        </label>
        <p className={`mt-2 text-sm ${settings.binancePayConfigured ? 'text-[var(--green)]' : 'text-[var(--text-2)]'}`}>
          {settings.binancePayConfigured ? 'Configured' : 'Not configured'}
        </p>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          If you do not add Binance Pay, the platform default payment method is used for your customers.
        </p>
        <label className="mt-3 block text-sm text-[var(--text-2)]">
          Merchant UID
          <input
            className={`${inputClass} mt-1`}
            value={settings.binanceMerchantUid ?? ''}
            onChange={(event) => setSettings({ ...settings, binanceMerchantUid: event.target.value })}
          />
        </label>
        <label className="mt-3 block text-sm text-[var(--text-2)]">
          API key
          <input
            type="password"
            className={`${inputClass} mt-1`}
            value={binanceKey}
            onChange={(event) => setBinanceKey(event.target.value)}
            placeholder={settings.binancePayConfigured ? '••••••••' : ''}
          />
        </label>
        <label className="mt-3 block text-sm text-[var(--text-2)]">
          API secret
          <input
            type="password"
            className={`${inputClass} mt-1`}
            value={binanceSecret}
            onChange={(event) => setBinanceSecret(event.target.value)}
            placeholder={settings.binancePayConfigured ? '••••••••' : ''}
          />
        </label>
        <button
          type="button"
          className="mt-3 rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
          onClick={() =>
            void patch(
              {
                binancePayEnabled: binanceEnabled,
                binanceMerchantUid: settings.binanceMerchantUid,
                ...(binanceKey ? { binanceApiKey: binanceKey } : {}),
                ...(binanceSecret ? { binanceApiSecret: binanceSecret } : {}),
              },
              'Binance Pay saved',
            )
          }
        >
          Save Binance Pay settings
        </button>
      </section>

      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-medium">Support</h2>
        <input
          className={`${inputClass} mt-3`}
          placeholder="Support contact"
          value={settings.supportContact ?? ''}
          onChange={(event) => setSettings({ ...settings, supportContact: event.target.value })}
        />
        <input
          className={`${inputClass} mt-3`}
          placeholder="Support chat URL"
          value={settings.supportChatUrl ?? ''}
          onChange={(event) => setSettings({ ...settings, supportChatUrl: event.target.value })}
        />
        <input
          className={`${inputClass} mt-3`}
          placeholder="Support phone"
          value={settings.supportPhone ?? ''}
          onChange={(event) => setSettings({ ...settings, supportPhone: event.target.value })}
        />
        <textarea
          className={`${inputClass} mt-3`}
          rows={3}
          placeholder="Support message"
          value={settings.supportMessage ?? ''}
          onChange={(event) => setSettings({ ...settings, supportMessage: event.target.value })}
        />
        <button
          type="button"
          className="mt-3 rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
          onClick={() =>
            void patch(
              {
                supportContact: settings.supportContact,
                supportChatUrl: settings.supportChatUrl,
                supportPhone: settings.supportPhone,
                supportMessage: settings.supportMessage,
              },
              'Support saved',
            )
          }
        >
          Save support settings
        </button>
      </section>

      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-medium">Reseller signups</h2>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.resellerSignupEnabled}
            onChange={(event) => setSettings({ ...settings, resellerSignupEnabled: event.target.checked })}
          />
          Show “Become a Reseller” in bot
        </label>
        <textarea
          className={`${inputClass} mt-3`}
          rows={3}
          value={settings.resellerSignupMessage ?? ''}
          onChange={(event) => setSettings({ ...settings, resellerSignupMessage: event.target.value })}
        />
        <button
          type="button"
          className="mt-3 rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
          onClick={() =>
            void patch(
              {
                resellerSignupEnabled: settings.resellerSignupEnabled,
                resellerSignupMessage: settings.resellerSignupMessage,
              },
              'Signup settings saved',
            )
          }
        >
          Save
        </button>
      </section>

      </div>

      <section className="mt-6 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-medium">Terms & policies</h2>
        <textarea
          className={`${inputClass} mt-3`}
          rows={4}
          placeholder="Terms of service"
          value={settings.termsOfService ?? ''}
          onChange={(event) => setSettings({ ...settings, termsOfService: event.target.value })}
        />
        <textarea
          className={`${inputClass} mt-3`}
          rows={4}
          placeholder="Return & refund policy"
          value={settings.refundPolicy ?? ''}
          onChange={(event) => setSettings({ ...settings, refundPolicy: event.target.value })}
        />
        <textarea
          className={`${inputClass} mt-3`}
          rows={4}
          placeholder="Privacy policy"
          value={settings.privacyPolicy ?? ''}
          onChange={(event) => setSettings({ ...settings, privacyPolicy: event.target.value })}
        />
        <button
          type="button"
          className="mt-3 rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
          onClick={() =>
            void patch(
              {
                termsOfService: settings.termsOfService,
                refundPolicy: settings.refundPolicy,
                privacyPolicy: settings.privacyPolicy,
              },
              'Policies saved',
            )
          }
        >
          Save terms & policies
        </button>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={ROUTES.reseller.settingsApiKeys} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          Developer API
        </Link>
        <Link href={ROUTES.reseller.settingsWebhooks} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          Webhooks
        </Link>
      </div>
    </>
  );
}
