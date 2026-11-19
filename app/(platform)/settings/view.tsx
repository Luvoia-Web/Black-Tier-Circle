'use client';

/**
 * Settings. Each section saves on its own. Legal text is owner-only and platform-wide.
 */

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, ErrorState, RelativeTime, Skeleton } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES } from '@/lib/navigation';

type Field = { readonly key: string; readonly label: string; readonly help: string; readonly allowed: boolean };
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
    readonly newAccountOrderCap: number;
    readonly newAccountAgeHours: number;
  };
  readonly business: { readonly platformName: string; readonly supportContact: string; readonly logoUrl: string } | null;
  readonly legal: { readonly terms: string; readonly refund: string; readonly privacy: string; readonly version: number; readonly updatedAt: string | null } | null;
  readonly payments: { readonly bep20Enabled: boolean; readonly addressMasked: string; readonly confirmations: number; readonly expiryMinutes: number } | null;
  readonly goal: { readonly goalUsdt?: string; readonly needsMigration?: boolean } | null;
  readonly integrations: { readonly suppliers: string; readonly groq: string; readonly hindsight: string } | null;
  readonly audit: readonly { readonly id: string; readonly action: string; readonly at: string }[];
  readonly stores: readonly { readonly id: string; readonly name: string }[];
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
  ordersPerDay: 'Limits how many unpaid orders one buyer can open in a day. A paid order is never blocked.',
  failedClaimsPerHour: 'Flags repeated failed payment claims for review.',
  supportMessagesPerHour: 'Slows a buyer who floods support. Their paid orders still deliver.',
  referralClaimsPerDay: 'Caps referral rewards one buyer can claim in a day.',
  newAccountOrderCap: 'A new buyer is limited to this many orders until the account is old enough.',
  newAccountAgeHours: 'How long a buyer counts as new for the cap above.',
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
        {loaded.needsMigration ? <p className="text-sm text-ink">Some settings need migration 0035 before they can be saved. Buyers are not blocked by that.</p> : null}
        {note ? <p className="text-sm text-ink">{note}</p> : null}
        {section === 'business' && loaded.business ? <BusinessForm initial={loaded.business} timezone={loaded.timezone} onDone={setNote} /> : null}
        {section === 'legal' ? <LegalForm initial={loaded.legal} onDone={setNote} /> : null}
        {section === 'policy' ? <PolicyForm fields={loaded.fields} stores={loaded.stores ?? []} owner={loaded.role === 'owner'} onDone={setNote} /> : null}
        {section === 'pricing' ? <PricingForm onDone={setNote} /> : null}
        {section === 'notifications' ? <NotificationsForm onDone={setNote} /> : null}
        {section === 'fraud' ? <FraudForm fraud={loaded.fraud} owner={loaded.role === 'owner'} onDone={setNote} /> : null}
        {section === 'payments' && loaded.payments ? <PaymentsForm initial={loaded.payments} onDone={setNote} /> : null}
        {section === 'store' ? <StoreForm goal={loaded.goal?.goalUsdt ?? ''} onDone={setNote} /> : null}
        {section === 'integrations' && loaded.integrations ? (
          <article className="glass-card space-y-2 rounded-lg p-4">
            <h2 className="text-sm text-ink">Integrations</h2>
            <p className="text-sm text-ink-soft">Suppliers: {loaded.integrations.suppliers}</p>
            <p className="text-sm text-ink-soft">Groq: {loaded.integrations.groq}</p>
            <p className="text-sm text-ink-soft">Hindsight: {loaded.integrations.hindsight}</p>
            <p className="text-xs text-ink-faint">Secret values are not shown.</p>
          </article>
        ) : null}
        {section === 'security' ? <SecurityForm rows={loaded.audit ?? []} onDone={setNote} /> : null}
        {section === 'danger' ? <DangerForm onDone={setNote} /> : null}
        {section === 'account' ? <AccountForm name={loaded.displayName} email={loaded.email} onDone={setNote} /> : null}
        {section === 'keys' ? <KeysForm onDone={setNote} /> : null}
        {section === 'webhooks' ? <WebhooksForm onDone={setNote} /> : null}
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
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'legal', terms, refund, privacy } }).then((result) => onDone(result.ok ? 'Legal text saved. Every bot shows this copy.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Legal</h2>
      <p className="text-sm text-ink-soft">Terms, the refund policy, and the privacy policy are mandatory and platform-wide. Resellers cannot edit or hide them. Every bot shows this copy.</p>
      {initial ? <p className="text-xs text-ink-faint">Version {initial.version}{initial.updatedAt ? <> · <RelativeTime value={initial.updatedAt} /></> : null}</p> : <p className="text-xs text-ink-faint">Needs migration 0035 before this text can be stored.</p>}
      <label className="block text-xs text-ink-faint">Terms<textarea className="mt-1 min-h-24 w-full rounded-md border border-white/10 bg-black/25 px-2 py-1 text-sm text-ink" value={terms} onChange={(event) => setTerms(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Refund policy<textarea className="mt-1 min-h-24 w-full rounded-md border border-white/10 bg-black/25 px-2 py-1 text-sm text-ink" value={refund} onChange={(event) => setRefund(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Privacy policy<textarea className="mt-1 min-h-24 w-full rounded-md border border-white/10 bg-black/25 px-2 py-1 text-sm text-ink" value={privacy} onChange={(event) => setPrivacy(event.target.value)} /></label>
      <Button type="submit">Save legal</Button>
    </form>
  );
}

function PolicyForm({ fields, stores, owner, onDone }: { readonly fields: readonly Field[]; readonly stores: readonly { readonly id: string; readonly name: string }[]; readonly owner: boolean; readonly onDone: (note: string) => void }): JSX.Element {
  const [values, setValues] = useState<Record<string, boolean>>(() => Object.fromEntries(fields.map((field) => [field.key, field.allowed])));
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
      {owner && stores.length > 0 ? (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <p className="text-sm text-ink">Per-store override</p>
          <p className="text-xs text-ink-faint">Saves tenants.reseller_policy_override for one store. An empty override means the store uses the platform policy.</p>
          <Button type="button" variant="secondary" onClick={() => { void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'override', tenantId: stores[0]?.id, policy: values } }).then((result) => onDone(result.ok ? `Override saved for ${stores[0]?.name}.` : result.error.message)); }}>Save override for {stores[0]?.name}</Button>
        </div>
      ) : null}
    </form>
  );
}

function PricingForm({ onDone }: { readonly onDone: (note: string) => void }): JSX.Element {
  const pricing = useData<{ readonly wholesaleKind?: string; readonly wholesaleValue?: string; readonly retailKind?: string; readonly retailValue?: string }>('/api/platform/pricing');
  const [wholesaleKind, setWholesaleKind] = useState<'percent' | 'fixed'>('percent');
  const [wholesaleValue, setWholesaleValue] = useState('0');
  const [retailKind, setRetailKind] = useState<'percent' | 'fixed'>('percent');
  const [retailValue, setRetailValue] = useState('0');
  const loaded = pricing.data;
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/pricing', { method: 'PUT', body: { wholesaleKind, wholesaleValue, retailKind, retailValue } }).then((result) => onDone(result.ok ? 'Pricing defaults saved.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Pricing defaults</h2>
      <p className="text-sm text-ink-soft">Wholesale and retail markup. The minimum margin is enforced when a reseller sets a retail price. Auto-reprice and stock sync stay on the product pricing screen.</p>
      {loaded ? <p className="text-xs text-ink-faint">Current wholesale {loaded.wholesaleKind} {loaded.wholesaleValue}, retail {loaded.retailKind} {loaded.retailValue}.</p> : null}
      <label className="block text-xs text-ink-faint">Wholesale kind<select className="mt-1 h-9 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={wholesaleKind} onChange={(event) => setWholesaleKind(event.target.value === 'fixed' ? 'fixed' : 'percent')}><option value="percent">Percent</option><option value="fixed">Fixed</option></select></label>
      <label className="block text-xs text-ink-faint">Wholesale value<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={wholesaleValue} onChange={(event) => setWholesaleValue(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Retail kind<select className="mt-1 h-9 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={retailKind} onChange={(event) => setRetailKind(event.target.value === 'fixed' ? 'fixed' : 'percent')}><option value="percent">Percent</option><option value="fixed">Fixed</option></select></label>
      <label className="block text-xs text-ink-faint">Retail value<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={retailValue} onChange={(event) => setRetailValue(event.target.value)} /></label>
      <Button type="submit">Save pricing</Button>
    </form>
  );
}

function NotificationsForm({ onDone }: { readonly onDone: (note: string) => void }): JSX.Element {
  const [failedOrder, setFailed] = useState(true);
  const [lowBalance, setLow] = useState(true);
  const [newReseller, setNew] = useState(true);
  const [largeTopup, setLarge] = useState(true);
  const [quietStart, setStart] = useState('23:00');
  const [quietEnd, setEnd] = useState('07:00');
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'notifications', failedOrder, lowBalance, newReseller, largeTopup, quietStart, quietEnd } }).then((result) => onDone(result.ok ? 'Notification settings saved.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Notifications</h2>
      <p className="text-sm text-ink-soft">Owner Telegram alerts. Quiet hours pause them. Needs migration 0035 before the first save.</p>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={failedOrder} onChange={(event) => setFailed(event.target.checked)} /> Failed order</label>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={lowBalance} onChange={(event) => setLow(event.target.checked)} /> Low supplier balance</label>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={newReseller} onChange={(event) => setNew(event.target.checked)} /> New reseller</label>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={largeTopup} onChange={(event) => setLarge(event.target.checked)} /> Large top-up</label>
      <label className="block text-xs text-ink-faint">Quiet from<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={quietStart} onChange={(event) => setStart(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Quiet until<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={quietEnd} onChange={(event) => setEnd(event.target.value)} /></label>
      <Button type="submit">Save notifications</Button>
    </form>
  );
}

function FraudForm({ fraud, owner, onDone }: { readonly fraud: Payload['fraud']; readonly owner: boolean; readonly onDone: (note: string) => void }): JSX.Element {
  const [values, setValues] = useState({ ...fraud, freebieClaimsPerDay: 5, discountRedemptionsPerCustomer: 5 });
  const rows = Object.entries(FRAUD_HELP);
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'fraud', ...values } }).then((result) => onDone(result.ok ? 'Fraud thresholds saved. A paid order is never blocked.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Fraud and abuse</h2>
      <p className="text-sm text-ink-soft">A paid order is never blocked. Suspicious activity is flagged for review.</p>
      {rows.map(([key, help]) => (
        <label key={key} className="block text-xs text-ink-faint">
          {help}
          <input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="number" value={values[key as keyof typeof values]} onChange={(event) => setValues({ ...values, [key]: Number(event.target.value) })} />
        </label>
      ))}
      <label className="block text-xs text-ink-faint">Freebie claims a buyer can make in a day.<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="number" value={values.freebieClaimsPerDay} onChange={(event) => setValues({ ...values, freebieClaimsPerDay: Number(event.target.value) })} /></label>
      <label className="block text-xs text-ink-faint">Discount redemptions one buyer can use.<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="number" value={values.discountRedemptionsPerCustomer} onChange={(event) => setValues({ ...values, discountRedemptionsPerCustomer: Number(event.target.value) })} /></label>
      {owner ? <Button type="submit">Save fraud</Button> : null}
    </form>
  );
}

function PaymentsForm({ initial, onDone }: { readonly initial: NonNullable<Payload['payments']>; readonly onDone: (note: string) => void }): JSX.Element {
  const [enabled, setEnabled] = useState(initial.bep20Enabled);
  const [address, setAddress] = useState('');
  const [confirmations, setConfirmations] = useState(initial.confirmations);
  const [minUsdt, setMinUsdt] = useState(1);
  const [maxUsdt, setMaxUsdt] = useState(10000);
  const [expiry, setExpiry] = useState(initial.expiryMinutes);
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'payments', bep20Enabled: enabled, address, confirmations, minUsdt, maxUsdt, expiryMinutes: expiry } }).then((result) => onDone(result.ok ? 'Payments saved. The address stays masked.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Payments</h2>
      <p className="text-sm text-ink-soft">BEP20 address on file: {initial.addressMasked || 'none'}. Leave the field empty to keep it.</p>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> BEP20 enabled</label>
      <label className="block text-xs text-ink-faint">New address<input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Confirmations<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="number" value={confirmations} onChange={(event) => setConfirmations(Number(event.target.value))} /></label>
      <label className="block text-xs text-ink-faint">Minimum top-up USDT<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="number" value={minUsdt} onChange={(event) => setMinUsdt(Number(event.target.value))} /></label>
      <label className="block text-xs text-ink-faint">Maximum top-up USDT<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="number" value={maxUsdt} onChange={(event) => setMaxUsdt(Number(event.target.value))} /></label>
      <label className="block text-xs text-ink-faint">Top-up expiry minutes<input className="mt-1 h-9 w-32 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" type="number" value={expiry} onChange={(event) => setExpiry(Number(event.target.value))} /></label>
      <Button type="submit">Save payments</Button>
    </form>
  );
}

function StoreForm({ goal, onDone }: { readonly goal: string; readonly onDone: (note: string) => void }): JSX.Element {
  const [status, setStatus] = useState<'open' | 'maintenance'>('open');
  const [message, setMessage] = useState('');
  const [goalUsdt, setGoal] = useState(goal);
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'store', storeStatus: status, maintenanceMessage: message, goalUsdt } }).then((result) => onDone(result.ok ? 'Store status saved.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Store status and revenue goal</h2>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="radio" checked={status === 'open'} onChange={() => setStatus('open')} /> Open</label>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="radio" checked={status === 'maintenance'} onChange={() => setStatus('maintenance')} /> Maintenance</label>
      <label className="block text-xs text-ink-faint">Maintenance message<input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
      <label className="block text-xs text-ink-faint">Revenue goal USDT<input className="mt-1 h-9 w-40 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" value={goalUsdt} onChange={(event) => setGoal(event.target.value)} /></label>
      <Button type="submit">Save store</Button>
    </form>
  );
}

function DangerForm({ onDone }: { readonly onDone: (note: string) => void }): JSX.Element {
  return (
    <form className="glass-card space-y-3 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/settings', { method: 'PATCH', body: { section: 'store', storeStatus: 'maintenance', maintenanceMessage: 'The platform is in maintenance.', goalUsdt: '0' } }).then((result) => onDone(result.ok ? 'Every owner-store buyer now sees maintenance.' : result.error.message)); }}>
      <h2 className="text-sm text-ink">Danger zone</h2>
      <p className="text-sm text-ink-soft">Puts the owner store into maintenance. Reseller stores keep their own open or closed switch.</p>
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
          <li key={row.id} className="text-sm text-ink">{row.action} · <RelativeTime value={row.at} /></li>
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
