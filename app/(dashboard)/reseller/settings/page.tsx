/**
 * @file app/(dashboard)/reseller/settings/page.tsx
 *
 * Full reseller store settings: bot, store, payments, Binance, support, terms.
 *
 * @module Dashboard
 */

'use client';

import Link from 'next/link';
import { Bell, Bot, CreditCard, LifeBuoy, Store } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ResellerApiKeysPanel } from '@/components/settings/reseller-api-keys-panel';
import { FormField } from '@/components/settings/FormField';
import { SaveButton } from '@/components/settings/SaveButton';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Toggle } from '@/components/settings/Toggle';
import { ErrorState } from '@/components/ui/fetch-states';
import { SkeletonCard } from '@/components/ui/Skeleton';
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
  readonly announcementChannelId: string | null;
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
  readonly notifyOrderPlaced: boolean;
  readonly notifyOrderDelivered: boolean;
  readonly notifyBalanceLow: boolean;
  readonly notifyBalanceThreshold: string;
  readonly notifyProductAdded: boolean;
};

type BotStatus = {
  readonly connected?: boolean;
  readonly username?: string;
  readonly status?: string;
};

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
  const [busy, setBusy] = useState<string | null>(null);

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

  async function patch(section: string, body: Record<string, unknown>, ok: string): Promise<void> {
    setBusy(section);
    try {
      const response = await fetch(API_ROUTES.resellerSettings, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        toast.error(json.error?.message ?? 'Unable to save');
        return;
      }
      toast.success(ok);
      await load();
    } catch {
      toast.error('Unable to save');
    } finally {
      setBusy(null);
    }
  }

  async function connectBot(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy('bot');
    try {
      const response = await fetch(API_ROUTES.botsConnect, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: token }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        toast.error(json.error?.message ?? 'Unable to connect bot');
        return;
      }
      setToken('');
      toast.success('Bot connected');
      await load();
    } catch {
      toast.error('Unable to connect bot');
    } finally {
      setBusy(null);
    }
  }

  async function disconnectBot(): Promise<void> {
    setBusy('bot');
    try {
      await fetch(API_ROUTES.botsDisconnect, { method: 'POST' });
      toast.success('Bot disconnected');
      await load();
    } catch {
      toast.error('Unable to disconnect bot');
    } finally {
      setBusy(null);
    }
  }

  if (loading && settings === null) {
    return (
      <>
        <PageHeader title="Settings" description="Store, bot, payments, and policies" />
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-56" />
          <SkeletonCard className="h-56" />
        </div>
      </>
    );
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
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <SettingsCard icon={<Bot size={18} />} title="Telegram bot" description="Customers reach your store through this bot.">
            <p className={`text-sm ${connected ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              {connected ? `● Connected as @${bot?.username ?? 'bot'}` : '○ Not connected'}
            </p>
            <form onSubmit={(event) => void connectBot(event)} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Bot token"
                className="btc-input"
              />
              <button type="submit" className="btc-btn-primary" disabled={busy === 'bot'}>
                Connect
              </button>
              <button type="button" onClick={() => void disconnectBot()} className="btc-btn-secondary" disabled={busy === 'bot'}>
                Disconnect
              </button>
            </form>
          </SettingsCard>

          <SettingsCard icon={<Store size={18} />} title="Store Identity" description="Shown in your bot's welcome message.">
            <FormField
              label="Store Name"
              value={settings.storeName ?? ''}
              onChange={(value) => setSettings({ ...settings, storeName: value })}
            />
            <SaveButton
              busy={busy === 'name'}
              onClick={() => void patch('name', { storeName: settings.storeName }, 'Name saved')}
            >
              Save
            </SaveButton>
          </SettingsCard>

          <SettingsCard title="Store Status" description="Choose whether customers can place orders.">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={`rounded-lg border p-4 text-left ${settings.storeStatus === 'open' ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}
                onClick={() => setSettings({ ...settings, storeStatus: 'open' })}
              >
                <p className="font-medium">{settings.storeStatus === 'open' ? '● Open' : '○ Open'}</p>
                <p className="mt-1 text-sm text-[var(--text-2)]">Accepting orders</p>
              </button>
              <button
                type="button"
                className={`rounded-lg border p-4 text-left ${settings.storeStatus === 'maintenance' ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}
                onClick={() => setSettings({ ...settings, storeStatus: 'maintenance' })}
              >
                <p className="font-medium">{settings.storeStatus === 'maintenance' ? '● Maintenance' : '○ Maintenance'}</p>
                <p className="mt-1 text-sm text-[var(--text-2)]">Temp. closed</p>
              </button>
            </div>
            {settings.storeStatus === 'maintenance' ? (
              <FormField
                label="Maintenance Message"
                multiline
                value={settings.maintenanceMsg ?? ''}
                onChange={(value) => setSettings({ ...settings, maintenanceMsg: value })}
              />
            ) : null}
            <SaveButton
              busy={busy === 'status'}
              onClick={() =>
                void patch(
                  'status',
                  { storeStatus: settings.storeStatus, maintenanceMsg: settings.maintenanceMsg },
                  'Status saved',
                )
              }
            >
              Save Status
            </SaveButton>
          </SettingsCard>

          <SettingsCard icon={<CreditCard size={18} />} title="Payment Methods" description="These settings control how your customers pay on your bot.">
            <p className="text-sm text-[var(--green)]">Credit (wallet) — purchases deduct from buyer credit</p>
            <div className="my-4 border-t border-[var(--border)]" />
            <Toggle label="Use my own USDT wallet" checked={useOwnWallet} onChange={setUseOwnWallet} />
            <p className="mt-2 text-sm text-[var(--text-3)]">
              {useOwnWallet ? 'Customers send USDT to your address.' : 'Using platform wallet'}
            </p>
            {useOwnWallet ? (
              <FormField
                label="USDT address"
                value={settings.usdtWalletBep20 ?? ''}
                placeholder="0x..."
                onChange={(value) => setSettings({ ...settings, usdtWalletBep20: value })}
              />
            ) : null}
            <FormField
              label="USDT minimum (BEP20)"
              value={settings.usdtMinimumBep20}
              onChange={(value) => setSettings({ ...settings, usdtMinimumBep20: value })}
            />
            <div className="my-4 border-t border-[var(--border)]" />
            <Toggle label="Binance Pay" checked={binanceEnabled} onChange={setBinanceEnabled} />
            <p className={`mt-2 text-sm ${settings.binancePayConfigured ? 'text-[var(--green)]' : 'text-[var(--text-2)]'}`}>
              {settings.binancePayConfigured ? 'Configured' : 'Not configured'}
            </p>
            <FormField
              label="Merchant UID"
              value={settings.binanceMerchantUid ?? ''}
              onChange={(value) => setSettings({ ...settings, binanceMerchantUid: value })}
            />
            <FormField
              label="API Key"
              type="password"
              value={binanceKey}
              placeholder={settings.binancePayConfigured ? '••••••••' : ''}
              onChange={setBinanceKey}
            />
            <FormField
              label="API Secret"
              type="password"
              value={binanceSecret}
              placeholder={settings.binancePayConfigured ? '••••••••' : ''}
              onChange={setBinanceSecret}
            />
            <SaveButton
              busy={busy === 'pay'}
              onClick={() =>
                void patch(
                  'pay',
                  {
                    useOwnUsdtWallet: useOwnWallet,
                    usdtWalletBep20: settings.usdtWalletBep20,
                    usdtMinimumBep20: settings.usdtMinimumBep20,
                    binancePayEnabled: binanceEnabled,
                    binanceMerchantUid: settings.binanceMerchantUid,
                    ...(binanceKey ? { binanceApiKey: binanceKey } : {}),
                    ...(binanceSecret ? { binanceApiSecret: binanceSecret } : {}),
                  },
                  'Payment settings saved',
                )
              }
            >
              Save Payment Settings
            </SaveButton>
          </SettingsCard>
        </div>

        <div className="space-y-6">
          <SettingsCard icon={<LifeBuoy size={18} />} title="Customer Support" description="Shown when a customer types /support.">
            <FormField
              label="Support Contact"
              value={settings.supportContact ?? ''}
              onChange={(value) => setSettings({ ...settings, supportContact: value })}
            />
            <FormField
              label="Telegram Link"
              value={settings.supportChatUrl ?? ''}
              placeholder="t.me/..."
              onChange={(value) => setSettings({ ...settings, supportChatUrl: value })}
            />
            <FormField
              label="Support phone"
              value={settings.supportPhone ?? ''}
              onChange={(value) => setSettings({ ...settings, supportPhone: value })}
            />
            <FormField
              label="Announcement channel"
              value={settings.announcementChannelId ?? ''}
              placeholder="-100123456789"
              onChange={(value) => setSettings({ ...settings, announcementChannelId: value })}
            />
            <p className="mb-3 text-xs text-[var(--text-3)]">Add your bot as admin to this channel first. New products are announced there.</p>
            <FormField
              label="Support Message"
              multiline
              value={settings.supportMessage ?? ''}
              onChange={(value) => setSettings({ ...settings, supportMessage: value })}
            />
            <SaveButton
              busy={busy === 'support'}
              onClick={() =>
                void patch(
                  'support',
                  {
                    supportContact: settings.supportContact,
                    supportChatUrl: settings.supportChatUrl,
                    supportPhone: settings.supportPhone,
                    supportMessage: settings.supportMessage,
                    announcementChannelId: settings.announcementChannelId,
                  },
                  'Support saved',
                )
              }
            >
              Save Support
            </SaveButton>
          </SettingsCard>

          <SettingsCard title="Terms & Policies">
            <FormField
              label="Terms of Service"
              multiline
              rows={4}
              value={settings.termsOfService ?? ''}
              onChange={(value) => setSettings({ ...settings, termsOfService: value })}
            />
            <FormField
              label="Return & Refund"
              multiline
              rows={4}
              value={settings.refundPolicy ?? ''}
              onChange={(value) => setSettings({ ...settings, refundPolicy: value })}
            />
            <FormField
              label="Privacy Policy"
              multiline
              rows={4}
              value={settings.privacyPolicy ?? ''}
              onChange={(value) => setSettings({ ...settings, privacyPolicy: value })}
            />
            <SaveButton
              busy={busy === 'terms'}
              onClick={() =>
                void patch(
                  'terms',
                  {
                    termsOfService: settings.termsOfService,
                    refundPolicy: settings.refundPolicy,
                    privacyPolicy: settings.privacyPolicy,
                  },
                  'Policies saved',
                )
              }
            >
              Save Policies
            </SaveButton>
          </SettingsCard>
        </div>
      </div>

      <div className="mt-6">
        <SettingsCard title="Reseller Signups" description="Optional invite shown in the bot menu.">
          <Toggle
            label='Show "Become a Reseller" in bot menu'
            checked={settings.resellerSignupEnabled}
            onChange={(checked) => setSettings({ ...settings, resellerSignupEnabled: checked })}
          />
          {settings.resellerSignupEnabled ? (
            <FormField
              label="Message"
              multiline
              value={settings.resellerSignupMessage ?? ''}
              onChange={(value) => setSettings({ ...settings, resellerSignupMessage: value })}
            />
          ) : null}
          <SaveButton
            busy={busy === 'signup'}
            onClick={() =>
              void patch(
                'signup',
                {
                  resellerSignupEnabled: settings.resellerSignupEnabled,
                  resellerSignupMessage: settings.resellerSignupMessage,
                },
                'Signup settings saved',
              )
            }
          >
            Save
          </SaveButton>
        </SettingsCard>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <ResellerApiKeysPanel />
        <SettingsCard icon={<Bell size={18} />} title="Notifications" description="Choose which account events you want to hear about.">
          <Toggle
            label="New order placed"
            checked={settings.notifyOrderPlaced}
            onChange={(checked) => setSettings({ ...settings, notifyOrderPlaced: checked })}
          />
          <Toggle
            label="Order delivered"
            checked={settings.notifyOrderDelivered}
            onChange={(checked) => setSettings({ ...settings, notifyOrderDelivered: checked })}
          />
          <Toggle
            label="Wallet balance low"
            checked={settings.notifyBalanceLow}
            onChange={(checked) => setSettings({ ...settings, notifyBalanceLow: checked })}
          />
          <FormField
            label="Low balance threshold (USDT)"
            value={settings.notifyBalanceThreshold}
            onChange={(value) => setSettings({ ...settings, notifyBalanceThreshold: value })}
          />
          <Toggle
            label="New product added by owner"
            checked={settings.notifyProductAdded}
            onChange={(checked) => setSettings({ ...settings, notifyProductAdded: checked })}
          />
          <SaveButton
            busy={busy === 'notify'}
            onClick={() =>
              void patch(
                'notify',
                {
                  notifyOrderPlaced: settings.notifyOrderPlaced,
                  notifyOrderDelivered: settings.notifyOrderDelivered,
                  notifyBalanceLow: settings.notifyBalanceLow,
                  notifyBalanceThreshold: settings.notifyBalanceThreshold,
                  notifyProductAdded: settings.notifyProductAdded,
                },
                'Notification preferences saved',
              )
            }
          >
            Save notification preferences
          </SaveButton>
        </SettingsCard>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
