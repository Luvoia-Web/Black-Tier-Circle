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
import { Bot, CreditCard, Rocket, Store } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { OwnerPlatformPanels } from '@/components/settings/owner-platform-panels';
import { FormField } from '@/components/settings/FormField';
import { SaveButton } from '@/components/settings/SaveButton';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Toggle } from '@/components/settings/Toggle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { LaunchCheck } from '@/modules/launch';

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
  const [botBusy, setBotBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [infoBusy, setInfoBusy] = useState(false);
  const [checks, setChecks] = useState<LaunchCheck[]>([]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [settingsResponse, launchResponse] = await Promise.all([
        fetch(API_ROUTES.ownerSettings),
        fetch(API_ROUTES.ownerLaunch),
      ]);
      const json = (await settingsResponse.json()) as SettingsPayload;
      if (!json.success || !json.data) {
        toast.error(json.error?.message ?? 'Unable to load settings');
        return;
      }
      setSettings(json.data.settings);
      setWebhookUrl(json.data.webhookUrl ?? '');
      const launchJson = (await launchResponse.json()) as {
        success: boolean;
        data?: { items: LaunchCheck[] };
      };
      if (launchJson.success && launchJson.data) {
        setChecks(launchJson.data.items);
      }
    } catch {
      toast.error('Unable to load settings');
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
      toast.error('Paste a bot token from BotFather');
      return;
    }
    setBotBusy(true);
    try {
      const json = await post(API_ROUTES.ownerSettingsBotConnect, { botToken });
      if (!json.success) {
        toast.error(json.error?.message ?? 'Unable to connect bot');
        return;
      }
      setBotToken('');
      toast.success('Owner bot connected');
      await load();
    } catch {
      toast.error('Unable to connect bot');
    } finally {
      setBotBusy(false);
    }
  }

  async function disconnectBot(): Promise<void> {
    setBotBusy(true);
    try {
      const json = await post(API_ROUTES.ownerSettingsBotDisconnect);
      if (!json.success) {
        toast.error(json.error?.message ?? 'Unable to disconnect bot');
        return;
      }
      toast.success('Owner bot disconnected');
      await load();
    } catch {
      toast.error('Unable to disconnect bot');
    } finally {
      setBotBusy(false);
    }
  }

  async function testBot(): Promise<void> {
    setBotBusy(true);
    try {
      const json = await post(API_ROUTES.ownerSettingsBotTest);
      if (!json.success) {
        toast.error(json.error?.message ?? 'Bot test failed');
        return;
      }
      toast.success('Bot responded to a health check');
      await load();
    } catch {
      toast.error('Bot test failed');
    } finally {
      setBotBusy(false);
    }
  }

  async function savePayments(): Promise<void> {
    if (!settings) {
      return;
    }
    setPayBusy(true);
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
        toast.error(json.error?.message ?? 'Unable to save payment settings');
        return;
      }
      setSettings(json.data.settings);
      setApiKey('');
      setApiSecret('');
      toast.success('Payment settings saved');
    } catch {
      toast.error('Unable to save payment settings');
    } finally {
      setPayBusy(false);
    }
  }

  async function saveInfo(): Promise<void> {
    if (!settings) {
      return;
    }
    setInfoBusy(true);
    try {
      const json = await patch(API_ROUTES.ownerSettings, {
        platformName: settings.platformName,
        supportContact: settings.supportContact,
        supportTelegram: settings.supportTelegram,
      });
      if (!json.success || !json.data) {
        toast.error(json.error?.message ?? 'Unable to save platform info');
        return;
      }
      setSettings(json.data.settings);
      toast.success('Platform info saved');
    } catch {
      toast.error('Unable to save platform info');
    } finally {
      setInfoBusy(false);
    }
  }

  const connected = settings?.ownerBotStatus === 'connected';
  const passing = checks.filter((item) => item.passing).length;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Bots, payments, and platform info. Changes apply immediately — no environment variable updates."
      />
      {loading || !settings ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-48" />
          <SkeletonCard className="h-48" />
        </div>
      ) : (
        <>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <SettingsCard icon={<Bot size={18} />} title="Owner Store Bot" description="This is your store bot that customers use directly.">
              {connected ? (
                <div className="space-y-2 text-sm">
                  <p className="text-[var(--green)]">● Connected</p>
                  <p>
                    Bot: @{settings.ownerBotUsername} | Bot ID: {settings.ownerBotId}
                  </p>
                  <p>Last active: {relativeTime(settings.ownerBotLastHealthAt)}</p>
                  <p className="break-all text-[var(--text-2)]">Webhook: {webhookUrl || 'Not set'}</p>
                  <div className="flex gap-2 pt-2">
                    <button type="button" className="btc-btn-primary" disabled={botBusy} onClick={() => void testBot()}>
                      Test Bot
                    </button>
                    <button type="button" className="btc-btn-secondary" disabled={botBusy} onClick={() => void disconnectBot()}>
                      Disconnect Bot
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--text-2)]">
                    <li>Open Telegram and message @BotFather</li>
                    <li>Send /newbot and follow the prompts</li>
                    <li>Copy the token BotFather gives you</li>
                    <li>Paste below and click Connect</li>
                  </ol>
                  <FormField label="Bot token" type="password" value={botToken} onChange={setBotToken} helper="Your token is encrypted and stored securely" />
                  <SaveButton busy={botBusy} onClick={() => void connectBot()}>
                    Connect Bot
                  </SaveButton>
                </div>
              )}
            </SettingsCard>

            <SettingsCard icon={<CreditCard size={18} />} title="Payment Methods" description="Configure how customers pay for orders.">
              <Toggle
                label="USDT BEP20"
                checked={settings.bep20Enabled}
                onChange={(checked) => setSettings({ ...settings, bep20Enabled: checked })}
              />
              <FormField
                label="Your wallet"
                value={settings.platformUsdtWalletBep20 ?? ''}
                placeholder="0x..."
                helper="Customers send USDT to this address."
                onChange={(value) => setSettings({ ...settings, platformUsdtWalletBep20: value })}
              />
              <div className="my-4 border-t border-[var(--border)]" />
              <Toggle
                label="Binance Pay"
                checked={settings.binancePayEnabled}
                onChange={(checked) => setSettings({ ...settings, binancePayEnabled: checked })}
              />
              <FormField
                label="Merchant ID"
                value={settings.binancePayMerchantId ?? ''}
                onChange={(value) => setSettings({ ...settings, binancePayMerchantId: value })}
              />
              <FormField
                label="API Key"
                type="password"
                value={apiKey}
                placeholder={settings.binancePayConfigured ? '••••••••' : ''}
                onChange={setApiKey}
              />
              <FormField
                label="API Secret"
                type="password"
                value={apiSecret}
                placeholder={settings.binancePayConfigured ? '••••••••' : ''}
                onChange={setApiSecret}
              />
              <p className={`mt-2 text-sm ${settings.binancePayConfigured ? 'text-[var(--green)]' : 'text-[var(--text-2)]'}`}>
                Status: {settings.binancePayConfigured ? '● Configured' : '○ Not configured'}
              </p>
              <SaveButton busy={payBusy} onClick={() => void savePayments()}>
                Save Payment Settings
              </SaveButton>
            </SettingsCard>
          </div>

          <div className="space-y-6">
            <SettingsCard icon={<Store size={18} />} title="Platform Info" description="Shown to customers and resellers.">
              <FormField
                label="Platform Name"
                value={settings.platformName}
                onChange={(value) => setSettings({ ...settings, platformName: value })}
              />
              <FormField
                label="Support Contact"
                value={settings.supportContact ?? ''}
                onChange={(value) => setSettings({ ...settings, supportContact: value })}
              />
              <FormField
                label="Support Telegram"
                value={settings.supportTelegram ?? ''}
                placeholder="t.me/..."
                onChange={(value) => setSettings({ ...settings, supportTelegram: value })}
              />
              <SaveButton busy={infoBusy} onClick={() => void saveInfo()}>
                Save Info
              </SaveButton>
            </SettingsCard>

            <SettingsCard icon={<Rocket size={18} />} title="Launch Readiness" description="A short view of the production checklist.">
              <p className="text-sm">
                {checks.length === 0 ? 'Checklist not loaded yet.' : `${passing}/${checks.length} checks passing`}
              </p>
              <ul className="mt-3 space-y-1 text-sm text-[var(--text-2)]">
                {checks.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    {item.passing ? 'Y' : 'N'} — {item.label}
                  </li>
                ))}
              </ul>
              <Link href={ROUTES.owner.launch} className="mt-4 inline-flex text-sm text-[var(--accent)] hover:underline">
                Open full launch checklist
              </Link>
            </SettingsCard>

            <Link href={ROUTES.public.apiDocs} className="inline-flex text-sm text-[var(--accent)] hover:underline">
              Open API documentation
            </Link>
          </div>
        </div>
        <OwnerPlatformPanels />
        </>
      )}
    </>
  );
}
