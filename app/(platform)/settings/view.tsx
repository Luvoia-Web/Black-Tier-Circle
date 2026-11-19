'use client';

/**
 * Settings. Each section saves on its own. Legal text is owner-only and platform-wide.
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, ErrorState, RelativeTime, Skeleton } from '@/components/platform/ui';
import { displayAuditAction, displayMarkup } from '@/lib/display-labels';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES } from '@/lib/navigation';

type Field = { readonly key: string; readonly label: string; readonly help: string; readonly allowed: boolean };
type StoreOverrideRow = { readonly id: string; readonly name: string; readonly override: Record<string, boolean> | null };
type Payload = {
  readonly role: 'owner' | 'reseller';
  readonly displayName: string;
  readonly email: string;
  readonly timezone: string;
  readonly tenantName: string | null;
  readonly needsMigration: boolean;
  readonly fields: readonly Field[];
  readonly fraud: {
    readonly ordersPerHour: number;
    readonly ordersPerDay: number;
    readonly failedClaimsPerHour: number;
    readonly supportMessagesPerHour: number;
    readonly referralClaimsPerDay: number;
    readonly freebieClaimsPerDay: number;
    readonly discountRedemptionsPerCustomer: number;
    readonly newAccountOrderCap: number;
    readonly newAccountAgeHours: number;
  };
  readonly business: { readonly platformName: string; readonly supportContact: string; readonly logoUrl: string } | null;
  readonly legal: { readonly terms: string; readonly refund: string; readonly privacy: string; readonly version: number; readonly updatedAt: string | null } | null;
  readonly payments: { readonly bep20Enabled: boolean; readonly addressMasked: string; readonly confirmations: number; readonly expiryMinutes: number; readonly minUsdt: string; readonly maxUsdt: string } | null;
  readonly notifications: { readonly failedOrder: boolean; readonly lowBalance: boolean; readonly newReseller: boolean; readonly largeTopup: boolean; readonly quietStart: string; readonly quietEnd: string } | null;
  readonly store: { readonly storeStatus: 'open' | 'maintenance'; readonly maintenanceMessage: string; readonly botShowResellerSignup: boolean; readonly botShowMyApi: boolean } | null;
  readonly goal: { readonly goalUsdt?: string; readonly needsMigration?: boolean } | null;
  readonly integrations: { readonly suppliers: string; readonly groq: string; readonly hindsight: string } | null;
  readonly audit: readonly { readonly id: string; readonly action: string; readonly at: string }[];
  readonly stores: readonly StoreOverrideRow[];
};

const OWNER_SECTIONS = [
  { id: 'business', label: 'Business' },
  { id: 'legal', label: 'Legal' },
  { id: 'policy', label: 'Reseller policy' },
  { id: 'pricing', label: 'Pricing defaults' },
  { id: 'fraud', label: 'Fraud and abuse' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'payments', label: 'Payments' },
  { id: 'store', label: 'Store status' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'security', label: 'Security' },
  { id: 'danger', label: 'Danger zone' },
] as const;

const RESELLER_SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'keys', label: 'API keys' },
  { id: 'webhooks', label: 'Webhooks' },
] as const;

const FRAUD_HELP: Record<string, string> = {
  ordersPerHour: 'Limits how many unpaid orders one buyer can open in an hour. A paid order is never blocked.',
  ordersPerDay: 'Daily threshold saved with fraud settings. A paid order is never blocked.',
  failedClaimsPerHour: 'Flags repeated failed payment claims for review.',
  supportMessagesPerHour: 'Slows a buyer who floods support. Their paid orders still deliver.',
  referralClaimsPerDay: 'Caps referral rewards one buyer can claim in a day.',
  freebieClaimsPerDay: 'Freebie claims a buyer can make in a day.',
  discountRedemptionsPerCustomer: 'Discount redemptions one buyer can use.',
  newAccountOrderCap: 'A new buyer is limited to this many unpaid orders until the account is old enough.',
  newAccountAgeHours: 'How long a buyer counts as new for the unpaid cap above.',
};

function SettingsBody(): JSX.Element {
  const params = useSearchParams();
  const router = useRouter();
  const settings = useData<Payload>('/api/platform/settings');
  const [note, setNote] = useState('');
  const section = params.get('section') || (settings.data?.role === 'reseller' ? 'account' : 'business');

  if (settings.loading && !settings.data) return <section className="space-y-3"><h1 className="text-[30px] font-medium tracking-tight text-ink">Settings</h1><Skeleton className="h-40 w-full" /></section>;
  if (settings.error && !settings.data) return <ErrorState message={settings.error.message} onRetry={settings.refetch} />;
  if (!settings.data) return <p className="text-sm text-ink-soft">Settings are not available.</p>;

  const loaded = settings.data;
  const sections = loaded.role === 'owner' ? OWNER_SECTIONS : RESELLER_SECTIONS;

  function open(id: string): void {
    const next = new URLSearchParams(params.toString());
    next.set('section', id);
    router.replace(`/settings?${next.toString()}`);
    setNote('');
  }

  function savedNote(message: string): void {
    setNote(message);
    settings.refetch();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h1 className="text-[30px] font-medium tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">{loaded.displayName}{loaded.tenantName ? ` · ${loaded.tenantName}` : ''}</p>
        <nav className="mt-4 space-y-1" aria-label="Settings sections">
          {sections.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={section === item.id} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${section === item.id ? 'bg-white/12 text-ink' : 'text-ink-soft'}`} onClick={() => open(item.id)}>{item.label}</button>
          ))}
        </nav>
      </div>
      <div className="min-w-0 space-y-4">
        {note ? <p className="text-sm text-ink">{note}</p> : null}
        {section === 'business' && loaded.business ? <BusinessForm initial={loaded.business} timezone={loaded.timezone} onDone={savedNote} /> : null}
        {section === 'legal' ? <LegalForm initial={loaded.legal} onDone={savedNote} /> : null}
        {section === 'policy' ? <PolicyForm fields={loaded.fields} stores={loaded.stores ?? []} owner={loaded.role === 'owner'} onDone={savedNote} /> : null}
        {section === 'pricing' ? <PricingForm onDone={savedNote} /> : null}
        {section === 'notifications' && loaded.notifications ? <NotificationsForm initial={loaded.notifications} onDone={savedNote} /> : null}
        {section === 'fraud' ? <FraudForm fraud={loaded.fraud} owner={loaded.role === 'owner'} onDone={savedNote} /> : null}
        {section === 'payments' && loaded.payments ? <PaymentsForm initial={loaded.payments} onDone={savedNote} /> : null}
        {section === 'store' ? <StoreForm initial={loaded.store} goal={loaded.goal?.goalUsdt ?? ''} onDone={savedNote} /> : null}
        {section === 'integrations' && loaded.integrations ? (
          <article className="glass-card space-y-2 rounded-lg p-4">
            <h2 className="text-sm text-ink">Integrations</h2>
            <p className="text-sm text-ink-soft">Suppliers: {loaded.integrations.suppliers}</p>
            <p className="text-sm text-ink-soft">Groq: {loaded.integrations.groq}</p>
            <p className="text-sm text-ink-soft">Hindsight: {loaded.integrations.hindsight}</p>
            <p className="text-xs text-ink-faint">Secret values are not shown.</p>
          </article>
        ) : null}
        {section === 'security' ? <SecurityForm rows={loaded.audit ?? []} onDone={savedNote} /> : null}
        {section === 'danger' ? <DangerForm onDone={savedNote} /> : null}
        {section === 'account' ? <AccountForm name={loaded.displayName} email={loaded.email} onDone={savedNote} /> : null}
        {section === 'keys' ? <KeysForm onDone={savedNote} /> : null}
        {section === 'webhooks' ? <WebhooksForm onDone={savedNote} /> : null}
        {loaded.role === 'reseller' && !['account', 'keys', 'webhooks'].includes(section) ? <p className="text-sm text-ink-soft">This section is set by the platform owner.</p> : null}
      </div>
    </div>
  );
}

function BusinessForm({ initial, timezone, onDone }: { readonly initial: NonNullable<Payload['business']>; readonly timezone: string; readonly onDone: (note: string) => void }): JSX.Element {
  const [name, setName] = useState(initial.platformName);
  const [support, setSupport] = useState(initial.supportContact);
  const [zone, setZone] = useState(timezone);
  const [logo, setLogo] = useState(initial.logoUrl);
  useEffect(() => {
    setName(initial.platformName);
    setSupport(initial.supportContact);
    setZone(timezone);
    setLogo(initial.logoUrl);
  }, [initial.platformName, initial.supportContact, initial.logoUrl, timezone]);
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'business', platformName: name, supportContact: support, timezone: zone, logoUrl: logo } }).then((result) => onDone(result.ok ? 'Business saved.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Business</h2>
      <label className="block text-xs text-ink-faint">Brand name<input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Logo URL<input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={logo} onChange={(event) => setLogo(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Support contact<input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={support} onChange={(event) => setSupport(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Timezone<input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={zone} onChange={(event) => setZone(event.target.value)} /></label>
      <Button type="submit">Save business</Button>
    </form>
  );
}

function LegalForm({ initial, onDone }: { readonly initial: Payload['legal']; readonly onDone: (note: string) => void }): JSX.Element {
  const [terms, setTerms] = useState(initial?.terms ?? '');
  const [refund, setRefund] = useState(initial?.refund ?? '');
  const [privacy, setPrivacy] = useState(initial?.privacy ?? '');
  useEffect(() => {
    setTerms(initial?.terms ?? '');
    setRefund(initial?.refund ?? '');
    setPrivacy(initial?.privacy ?? '');
  }, [initial?.terms, initial?.refund, initial?.privacy]);
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'legal', terms, refund, privacy } }).then((result) => onDone(result.ok ? 'Legal text saved. Every bot shows this copy.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Legal</h2>
      <p className="text-sm text-ink-soft">Terms, the refund policy, and the privacy policy are mandatory and platform-wide. Resellers cannot edit or hide them. Every bot shows this copy.</p>
      {initial ? <p className="text-xs text-ink-faint">Version {initial.version}{initial.updatedAt ? <> · <RelativeTime value={initial.updatedAt} /></> : null}</p> : null}
      <label className="block text-xs text-ink-faint">Terms<textarea className="mt-1 min-h-24 w-full rounded-md border border-white/10 bg-black/25 px-2 py-1 text-sm text-ink" value={terms} onChange={(event) => setTerms(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Refund policy<textarea className="mt-1 min-h-24 w-full rounded-md border border-white/10 bg-black/25 px-2 py-1 text-sm text-ink" value={refund} onChange={(event) => setRefund(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Privacy policy<textarea className="mt-1 min-h-24 w-full rounded-md border border-white/10 bg-black/25 px-2 py-1 text-sm text-ink" value={privacy} onChange={(event) => setPrivacy(event.target.value)} /></label>
      <Button type="submit">Save legal</Button>
    </form>
  );
}

function PolicyForm({ fields, stores, owner, onDone }: { readonly fields: readonly Field[]; readonly stores: readonly StoreOverrideRow[]; readonly owner: boolean; readonly onDone: (note: string) => void }): JSX.Element {
  const [values, setValues] = useState<Record<string, boolean>>(() => Object.fromEntries(fields.map((field) => [field.key, field.allowed])));
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => stores[0]?.id ?? '');
  const selectedStore = stores.find((store) => store.id === selectedStoreId) ?? stores[0] ?? null;
  const [overrideValues, setOverrideValues] = useState<Record<string, boolean>>(() => {
    const base = Object.fromEntries(fields.map((field) => [field.key, field.allowed]));
    return selectedStore?.override ? { ...base, ...selectedStore.override } : base;
  });

  useEffect(() => {
    const base = Object.fromEntries(fields.map((field) => [field.key, field.allowed]));
    setValues(base);
    const active = stores.find((store) => store.id === selectedStoreId) ?? stores[0] ?? null;
    if (active && active.id !== selectedStoreId) {
      setSelectedStoreId(active.id);
    }
    setOverrideValues(active?.override ? { ...base, ...active.override } : base);
  }, [fields, stores, selectedStoreId]);

  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'policy', policy: values } }).then((result) => onDone(result.ok ? 'Reseller policy saved.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Reseller policy</h2>
      <p className="text-sm text-ink-soft">Terms, refunds, and privacy are not on this list. A reseller cannot change those. Each switch below is a field a reseller may change unless you turn it off.</p>
      <ul className="space-y-2">
        {fields.map((field) => (
          <li key={field.key} className="rounded-lg border border-white/10 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink">{field.label}</span>
              {owner ? (
                <button type="button" aria-pressed={values[field.key] !== false} className="text-sm text-ink" onClick={() => setValues({ ...values, [field.key]: values[field.key] === false })}>{values[field.key] === false ? 'Locked' : 'Resellers can change this'}</button>
              ) : (
                <span className="text-sm text-ink-soft">{values[field.key] === false ? 'Locked' : 'Resellers can change this'}</span>
              )}
            </div>
            <p className="text-xs text-ink-faint">{field.help}</p>
          </li>
        ))}
      </ul>
      {owner ? <Button type="submit">Save policy</Button> : null}
      {owner && stores.length > 0 && selectedStore ? (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm text-ink">Per-store override</p>
              <p className="text-xs text-ink-faint">
                {selectedStore.override
                  ? `${selectedStore.name} uses a custom override.`
                  : `${selectedStore.name} currently follows the platform policy above.`}
              </p>
            </div>
            <select
              aria-label="Select store for policy override"
              className="h-9 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink"
              value={selectedStore.id}
              onChange={(event) => {
                const nextId = event.target.value;
                setSelectedStoreId(nextId);
                const nextStore = stores.find((store) => store.id === nextId);
                const base = Object.fromEntries(fields.map((field) => [field.key, field.allowed]));
                setOverrideValues(nextStore?.override ? { ...base, ...nextStore.override } : base);
              }}
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </div>
          <ul className="space-y-2">
            {fields.map((field) => (
              <li key={`override-${field.key}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2">
                <span className="text-sm text-ink">{field.label}</span>
                <button
                  type="button"
                  aria-pressed={overrideValues[field.key] !== false}
                  className="text-sm text-ink"
                  onClick={() => setOverrideValues({ ...overrideValues, [field.key]: overrideValues[field.key] === false })}
                >
                  {overrideValues[field.key] === false ? 'Locked for store' : 'Allowed for store'}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void runAction('/api/platform/settings', {
                  method: 'PATCH',
                  body: { section: 'override', tenantId: selectedStore.id, policy: overrideValues },
                }).then((result) => onDone(result.ok ? `Override saved for ${selectedStore.name}.` : result.error.message));
              }}
            >
              Save override for {selectedStore.name}
            </Button>
            {selectedStore.override ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void runAction('/api/platform/settings', {
                    method: 'PATCH',
                    body: { section: 'override', tenantId: selectedStore.id, policy: null },
                  }).then((result) => onDone(result.ok ? `${selectedStore.name} now uses the platform policy.` : result.error.message));
                }}
              >
                Use platform default
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}

function PricingForm({ onDone }: { readonly onDone: (note: string) => void }): JSX.Element {
  const pricing = useData<{ readonly wholesaleKind?: 'percent' | 'fixed'; readonly wholesaleValue?: string; readonly retailKind?: 'percent' | 'fixed'; readonly retailValue?: string }>('/api/platform/pricing');
  const [wholesaleKind, setWholesaleKind] = useState<'percent' | 'fixed'>('percent');
  const [wholesaleValue, setWholesaleValue] = useState('0');
  const [retailKind, setRetailKind] = useState<'percent' | 'fixed'>('percent');
  const [retailValue, setRetailValue] = useState('0');
  const [hydrated, setHydrated] = useState(false);
  const loaded = pricing.data;
  useEffect(() => {
    if (!loaded || hydrated) return;
    if (loaded.wholesaleKind === 'percent' || loaded.wholesaleKind === 'fixed') setWholesaleKind(loaded.wholesaleKind);
    if (loaded.wholesaleValue !== undefined) setWholesaleValue(loaded.wholesaleValue);
    if (loaded.retailKind === 'percent' || loaded.retailKind === 'fixed') setRetailKind(loaded.retailKind);
    if (loaded.retailValue !== undefined) setRetailValue(loaded.retailValue);
    setHydrated(true);
  }, [loaded, hydrated]);
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/pricing', { method: 'PUT', body: { wholesaleKind, wholesaleValue, retailKind, retailValue } }).then((result) => { if (result.ok) pricing.refetch(); onDone(result.ok ? 'Pricing defaults saved.' : result.error.message); }); }}>
      <h2 className="text-sm text-ink">Pricing defaults</h2>
      <p className="text-sm text-ink-soft">Wholesale and retail markup. The minimum margin is enforced when a reseller sets a retail price. Auto-reprice and stock sync stay on the product pricing screen.</p>
      {loaded && loaded.wholesaleKind && loaded.wholesaleValue !== undefined && loaded.retailKind && loaded.retailValue !== undefined ? (
        <p className="text-xs text-ink-faint">Current wholesale {displayMarkup(loaded.wholesaleKind, loaded.wholesaleValue)}, retail {displayMarkup(loaded.retailKind, loaded.retailValue)}.</p>
      ) : null}
      <label className="block text-xs text-ink-faint">Wholesale kind<select className="mt-1 h-9 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={wholesaleKind} onChange={(event) => setWholesaleKind(event.target.value === 'fixed' ? 'fixed' : 'percent')}><option value="percent">Percent</option><option value="fixed">Fixed USDT</option></select></label>
      <label className="block text-xs text-ink-faint">Wholesale value<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={wholesaleValue} onChange={(event) => setWholesaleValue(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Retail kind<select className="mt-1 h-9 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={retailKind} onChange={(event) => setRetailKind(event.target.value === 'fixed' ? 'fixed' : 'percent')}><option value="percent">Percent</option><option value="fixed">Fixed USDT</option></select></label>
      <label className="block text-xs text-ink-faint">Retail value<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={retailValue} onChange={(event) => setRetailValue(event.target.value)} /></label>
      <Button type="submit">Save pricing</Button>
    </form>
  );
}

function NotificationsForm({ initial, onDone }: { readonly initial: NonNullable<Payload['notifications']>; readonly onDone: (note: string) => void }): JSX.Element {
  const [failedOrder, setFailed] = useState(initial.failedOrder);
  const [lowBalance, setLow] = useState(initial.lowBalance);
  const [newReseller, setNew] = useState(initial.newReseller);
  const [largeTopup, setLarge] = useState(initial.largeTopup);
  const [quietStart, setStart] = useState(initial.quietStart);
  const [quietEnd, setEnd] = useState(initial.quietEnd);
  useEffect(() => {
    setFailed(initial.failedOrder);
    setLow(initial.lowBalance);
    setNew(initial.newReseller);
    setLarge(initial.largeTopup);
    setStart(initial.quietStart);
    setEnd(initial.quietEnd);
  }, [initial.failedOrder, initial.lowBalance, initial.newReseller, initial.largeTopup, initial.quietStart, initial.quietEnd]);
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'notifications', failedOrder, lowBalance, newReseller, largeTopup, quietStart, quietEnd } }).then((result) => onDone(result.ok ? 'Notification settings saved.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Notifications</h2>
      <p className="text-sm text-ink-soft">Owner Telegram alerts. Quiet hours use 24-hour HH:MM and pause alerts during that window.</p>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={failedOrder} onChange={(event) => setFailed(event.target.checked)} /> Failed order</label>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={lowBalance} onChange={(event) => setLow(event.target.checked)} /> Low supplier balance</label>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={newReseller} onChange={(event) => setNew(event.target.checked)} /> New reseller</label>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={largeTopup} onChange={(event) => setLarge(event.target.checked)} /> Large top-up</label>
      <label className="block text-xs text-ink-faint">Quiet from (HH:MM)<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" placeholder="23:00" value={quietStart} onChange={(event) => setStart(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Quiet until (HH:MM)<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" placeholder="07:00" value={quietEnd} onChange={(event) => setEnd(event.target.value)} /></label>
      <Button type="submit">Save notifications</Button>
    </form>
  );
}

function FraudForm({ fraud, owner, onDone }: { readonly fraud: Payload['fraud']; readonly owner: boolean; readonly onDone: (note: string) => void }): JSX.Element {
  const [values, setValues] = useState(fraud);
  useEffect(() => {
    setValues(fraud);
  }, [fraud]);
  const rows = Object.entries(FRAUD_HELP);
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'fraud', ...values } }).then((result) => onDone(result.ok ? 'Fraud thresholds saved. A paid order is never blocked.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Fraud and abuse</h2>
      <p className="text-sm text-ink-soft">A paid order is never blocked. Real limits sit on unpaid floods, referrals, freebies, and discounts.</p>
      {rows.map(([key, help]) => (
        <label key={key} className="block text-xs text-ink-faint">
          {help}
          <input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="number" value={values[key as keyof typeof values]} onChange={(event) => setValues({ ...values, [key]: Number(event.target.value) })} />
        </label>
      ))}
      {owner ? <Button type="submit">Save fraud</Button> : null}
    </form>
  );
}

function PaymentsForm({ initial, onDone }: { readonly initial: NonNullable<Payload['payments']>; readonly onDone: (note: string) => void }): JSX.Element {
  const [enabled, setEnabled] = useState(initial.bep20Enabled);
  const [address, setAddress] = useState('');
  const [confirmations, setConfirmations] = useState(initial.confirmations);
  const [minUsdt, setMinUsdt] = useState(initial.minUsdt);
  const [maxUsdt, setMaxUsdt] = useState(initial.maxUsdt);
  const [expiry, setExpiry] = useState(initial.expiryMinutes);
  useEffect(() => {
    setEnabled(initial.bep20Enabled);
    setConfirmations(initial.confirmations);
    setMinUsdt(initial.minUsdt);
    setMaxUsdt(initial.maxUsdt);
    setExpiry(initial.expiryMinutes);
  }, [initial.bep20Enabled, initial.confirmations, initial.minUsdt, initial.maxUsdt, initial.expiryMinutes]);
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'payments', bep20Enabled: enabled, address, confirmations, minUsdt, maxUsdt, expiryMinutes: expiry } }).then((result) => onDone(result.ok ? 'Payments saved. The address stays masked.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Payments</h2>
      <p className="text-sm text-ink-soft">BEP20 address on file: {initial.addressMasked || 'none'}. Leave the field empty to keep it.</p>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> BEP20 enabled</label>
      <label className="block text-xs text-ink-faint">New address<input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Confirmations<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="number" value={confirmations} onChange={(event) => setConfirmations(Number(event.target.value))} /></label>
      <label className="block text-xs text-ink-faint">Minimum top-up USDT<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" inputMode="decimal" value={minUsdt} onChange={(event) => setMinUsdt(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Maximum top-up USDT<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" inputMode="decimal" value={maxUsdt} onChange={(event) => setMaxUsdt(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Top-up expiry minutes<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="number" value={expiry} onChange={(event) => setExpiry(Number(event.target.value))} /></label>
      <Button type="submit">Save payments</Button>
    </form>
  );
}

function StoreForm({ initial, goal, onDone }: { readonly initial: Payload['store']; readonly goal: string; readonly onDone: (note: string) => void }): JSX.Element {
  const [status, setStatus] = useState<'open' | 'maintenance'>(initial?.storeStatus ?? 'open');
  const [message, setMessage] = useState(initial?.maintenanceMessage ?? '');
  const [goalUsdt, setGoal] = useState(goal);
  const [showResellerSignup, setShowResellerSignup] = useState(initial?.botShowResellerSignup ?? false);
  const [showMyApi, setShowMyApi] = useState(initial?.botShowMyApi ?? false);
  useEffect(() => {
    if (initial) {
      setStatus(initial.storeStatus);
      setMessage(initial.maintenanceMessage);
      setShowResellerSignup(initial.botShowResellerSignup);
      setShowMyApi(initial.botShowMyApi);
    }
    setGoal(goal);
  }, [initial, goal]);
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'store', storeStatus: status, maintenanceMessage: message, goalUsdt, botShowResellerSignup: showResellerSignup, botShowMyApi: showMyApi } }).then((result) => onDone(result.ok ? 'Store status saved.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Store status and revenue goal</h2>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="radio" checked={status === 'open'} onChange={() => setStatus('open')} /> Open</label>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="radio" checked={status === 'maintenance'} onChange={() => setStatus('maintenance')} /> Maintenance</label>
      <label className="block text-xs text-ink-faint">Maintenance message<input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Revenue goal USDT<input className="mt-1 h-9 w-40 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" inputMode="decimal" value={goalUsdt} onChange={(event) => setGoal(event.target.value)} /></label>
      <div className="space-y-2 border-t border-white/10 pt-3">
        <p className="text-xs text-ink-faint">Buyer bot menu controls (owner-only, off by default)</p>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={showResellerSignup} onChange={(event) => setShowResellerSignup(event.target.checked)} /> Show Become a Reseller in buyer bot</label>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={showMyApi} onChange={(event) => setShowMyApi(event.target.checked)} /> Show My API in buyer bot</label>
      </div>
      <Button type="submit">Save store</Button>
    </form>
  );
}

function DangerForm({ onDone }: { readonly onDone: (note: string) => void }): JSX.Element {
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'store', storeStatus: 'maintenance', maintenanceMessage: 'The platform is in maintenance.' } }).then((result) => onDone(result.ok ? 'Every owner-store buyer now sees maintenance.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Danger zone</h2>
      <p className="text-sm text-ink-soft">Puts the owner store into maintenance without changing your revenue goal. Reseller stores keep their own open or closed switch.</p>
      <Button type="submit">Save maintenance</Button>
    </form>
  );
}

function SecurityForm({ rows, onDone }: { readonly rows: readonly { readonly id: string; readonly action: string; readonly at: string }[]; readonly onDone: (note: string) => void }): JSX.Element {
  return (
    <article className="glass-card space-y-3 rounded-lg p-4">
      <h2 className="text-sm text-ink">Security</h2>
      <p className="text-sm text-ink-soft">This browser stays signed in. Other sessions for this account are ended.</p>
      <Button variant="secondary" onClick={() => { void runAction('/api/platform/settings', { method: 'POST' }).then((result) => onDone(result.ok ? 'Other sessions were signed out.' : result.error.message)); }}>Sign out of other sessions</Button>
      {rows.length === 0 ? <p className="text-sm text-ink-soft">No audit rows yet.</p> : null}
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="text-sm text-ink">{displayAuditAction(row.action)} · <RelativeTime value={row.at} /></li>
        ))}
      </ul>
    </article>
  );
}

function AccountForm({ name, email, onDone }: { readonly name: string; readonly email: string; readonly onDone: (note: string) => void }): JSX.Element {
  const [displayName, setName] = useState(name);
  const [currentPassword, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="space-y-4">
      <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction(API_ROUTES.resellerProfile, { method: 'PATCH', body: { displayName } }).then((result) => onDone(result.ok ? 'Profile saved.' : result.error.message)); }}>
        <h2 className="text-sm text-ink">Account</h2>
        <p className="text-sm text-ink-soft">{email}</p>
        <label className="block text-xs text-ink-faint">Display name<input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={displayName} onChange={(event) => setName(event.target.value)} /></label>
        <Button type="submit">Save profile</Button>
      </form>
      <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction(API_ROUTES.resellerProfilePassword, { method: 'PATCH', body: { currentPassword, newPassword: password, confirmPassword: password } }).then((result) => onDone(result.ok ? 'Password changed.' : result.error.message)); }}>
        <label className="block text-xs text-ink-faint">Current password<input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="password" value={currentPassword} onChange={(event) => setCurrent(event.target.value)} /></label>
        <label className="block text-xs text-ink-faint">New password<input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <Button type="submit" disabled={password.length < 8 || currentPassword.length < 1}>Change password</Button>
      </form>
    </div>
  );
}

function KeysForm({ onDone }: { readonly onDone: (note: string) => void }): JSX.Element {
  const keys = useData<{ readonly keys: readonly { readonly id: string; readonly label: string; readonly keyPrefix: string }[] }>(API_ROUTES.resellerApiKeys);
  const [label, setLabel] = useState('');
  const [shown, setShown] = useState('');
  return (
    <article className="glass-card space-y-3 rounded-lg p-4">
      <h2 className="text-sm text-ink">API keys</h2>
      {keys.error ? <ErrorState message={keys.error.message} onRetry={keys.refetch} /> : null}
      <ul className="space-y-1">
        {(keys.data?.keys ?? []).map((key) => (
          <li key={key.id} className="flex items-center justify-between gap-2 text-sm text-ink">
            <span>{key.label} · {key.keyPrefix}</span>
            <Button variant="secondary" onClick={() => { void runAction(`${API_ROUTES.resellerApiKeys}/${key.id}`, { method: 'DELETE' }).then((result) => { onDone(result.ok ? 'Key revoked.' : result.error.message); if (result.ok) keys.refetch(); }); }}>Revoke</Button>
          </li>
        ))}
      </ul>
      {shown ? <p className="text-sm text-ink">Copy this key now. It is shown once: {shown}</p> : null}
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void runAction<{ rawKey?: string }>(API_ROUTES.resellerApiKeys, { body: { label, environment: 'live' } }).then((result) => { if (!result.ok) { onDone(result.error.message); return; } setShown(result.data.rawKey ?? ''); setLabel(''); keys.refetch(); }); }}>
        <input className="h-9 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label="Key label" value={label} onChange={(event) => setLabel(event.target.value)} />
        <Button type="submit" disabled={label.trim().length < 2}>Create key</Button>
      </form>
    </article>
  );
}

function WebhooksForm({ onDone }: { readonly onDone: (note: string) => void }): JSX.Element {
  const hooks = useData<{ readonly webhooks: readonly { readonly id: string; readonly url: string }[] }>(API_ROUTES.resellerWebhooks);
  const [url, setUrl] = useState('');
  return (
    <article className="glass-card space-y-3 rounded-lg p-4">
      <h2 className="text-sm text-ink">Webhooks</h2>
      {hooks.error ? <ErrorState message={hooks.error.message} onRetry={hooks.refetch} /> : null}
      <ul className="space-y-1">
        {(hooks.data?.webhooks ?? []).map((hook) => (
          <li key={hook.id} className="flex items-center justify-between gap-2 text-sm text-ink">
            <span className="truncate">{hook.url}</span>
            <Button variant="secondary" onClick={() => { void runAction(`${API_ROUTES.resellerWebhooks}/${hook.id}`, { method: 'DELETE' }).then((result) => { onDone(result.ok ? 'Webhook deleted.' : result.error.message); if (result.ok) hooks.refetch(); }); }}>Delete</Button>
          </li>
        ))}
      </ul>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void runAction(API_ROUTES.resellerWebhooks, { body: { url, events: ['order.paid'] } }).then((result) => { onDone(result.ok ? 'Webhook created. The secret was returned once by the API.' : result.error.message); if (result.ok) { setUrl(''); hooks.refetch(); } }); }}>
        <input className="h-9 min-w-[220px] flex-1 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label="Webhook url" value={url} onChange={(event) => setUrl(event.target.value)} />
        <Button type="submit" disabled={!url.startsWith('https://')}>Create webhook</Button>
      </form>
    </article>
  );
}

export function SettingsView(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <SettingsBody />
    </Suspense>
  );
}
