'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LottiePlayer } from '@/components/motion/LottiePlayer';
import { AnimatedCounter } from '@/components/motion/AnimatedCounter';
import { Toggle } from '@/components/settings/Toggle';
import { API_ROUTES } from '@/lib/navigation';

type SettingsShape = {
  readonly storeName?: string | null;
  readonly supportContact?: string | null;
  readonly supportPhone?: string | null;
  readonly supportMessage?: string | null;
  readonly supportChatUrl?: string | null;
  readonly notifyOrderPlaced?: boolean;
  readonly notifyOrderDelivered?: boolean;
  readonly notifyBalanceLow?: boolean;
  readonly notifyProductAdded?: boolean;
};

/**
 * Store identity, live stats, and notification preferences for the reseller account.
 */
export function AccountStudio(): JSX.Element {
  const [settings, setSettings] = useState<SettingsShape>({});
  const [stats, setStats] = useState({ revenue: 0, orders: 0, products: 0, customers: 0, bot: 'Not connected' });
  const [saved, setSaved] = useState<string | null>(null);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    void fetch(API_ROUTES.resellerSettings)
      .then(async (response) => {
        const json = (await response.json()) as { success?: boolean; data?: { settings?: SettingsShape } };
        if (json.success && json.data?.settings) {
          setSettings(json.data.settings);
          setPhone(json.data.settings.supportPhone ?? '');
        }
      })
      .catch(() => undefined);
    void Promise.all([
      fetch(`${API_ROUTES.resellerOverview}?period=lifetime`),
      fetch(API_ROUTES.botsStatus),
    ]).then(async ([overviewResponse, botResponse]) => {
      const overview = (await overviewResponse.json()) as {
        success?: boolean;
        data?: { stats?: { revenueMinor?: string; paidOrders?: number; productsListed?: number } };
      };
      const bot = (await botResponse.json()) as { success?: boolean; data?: { connected?: boolean; customerCount?: number } };
      setStats({
        revenue: Number(overview.data?.stats?.revenueMinor ?? 0) / 1_000_000,
        orders: overview.data?.stats?.paidOrders ?? 0,
        products: overview.data?.stats?.productsListed ?? 0,
        customers: bot.data?.customerCount ?? 0,
        bot: bot.data?.connected ? 'Connected' : 'Not connected',
      });
    });
  }, []);

  async function save(patch: SettingsShape, key: string): Promise<void> {
    const response = await fetch(API_ROUTES.resellerSettings, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = (await response.json()) as { success?: boolean; error?: { message?: string } };
    if (!json.success) {
      toast.error(json.error?.message ?? 'Unable to save');
      return;
    }
    setSettings((current) => ({ ...current, ...patch }));
    setSaved(key);
    toast.success('Saved');
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="text-sm font-semibold">Your business</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="Revenue" value={<AnimatedCounter value={stats.revenue} decimals={2} suffix=" USDT" />} />
          <Stat label="Orders" value={<AnimatedCounter value={stats.orders} />} />
          <Stat label="Products" value={<AnimatedCounter value={stats.products} />} />
          <Stat label="Customers" value={<AnimatedCounter value={stats.customers} />} />
        </div>
        <p className="mt-3 text-sm text-[var(--text-2)]">Bot: {stats.bot}</p>
      </section>
      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="text-sm font-semibold">Store identity</h2>
        <Field
          label="Store name"
          value={settings.storeName ?? ''}
          onSave={(value) => void save({ storeName: value }, 'store')}
        />
        <Field
          label="Support contact"
          value={settings.supportContact ?? ''}
          onSave={(value) => void save({ supportContact: value }, 'support')}
        />
        <label className="mt-3 block text-sm text-[var(--text-2)]">
          Phone
          <input className="btc-input mt-1" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <button type="button" className="btc-btn-secondary mt-2" onClick={() => void save({ supportPhone: phone }, 'phone')}>
          Save phone
        </button>
        {saved ? <LottiePlayer name="success-checkmark" loop={false} className="mt-2 h-10 w-10" /> : null}
      </section>
      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 lg:col-span-2">
        <h2 className="mb-3 text-sm font-semibold">Notifications</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle label="Order placed" checked={settings.notifyOrderPlaced !== false} onChange={(checked) => void save({ notifyOrderPlaced: checked }, 'n1')} />
          <Toggle label="Order delivered" checked={settings.notifyOrderDelivered !== false} onChange={(checked) => void save({ notifyOrderDelivered: checked }, 'n2')} />
          <Toggle label="Low balance" checked={settings.notifyBalanceLow !== false} onChange={(checked) => void save({ notifyBalanceLow: checked }, 'n3')} />
          <Toggle label="New products" checked={settings.notifyProductAdded !== false} onChange={(checked) => void save({ notifyProductAdded: checked }, 'n4')} />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: JSX.Element }): JSX.Element {
  return (
    <div className="rounded-[var(--r-md)] bg-[var(--bg-raised)] p-3">
      <p className="text-xs text-[var(--text-3)]">{label}</p>
      <p className="text-lg font-semibold text-[var(--text-1)]">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onSave,
}: {
  readonly label: string;
  readonly value: string;
  readonly onSave: (value: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="mt-3 block text-sm text-[var(--text-2)]">
      {label}
      <span className="mt-1 flex gap-2">
        <input className="btc-input" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button type="button" className="btc-btn-secondary" onClick={() => onSave(draft)}>
          Save
        </button>
      </span>
    </label>
  );
}
