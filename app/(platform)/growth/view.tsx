'use client';

/**
 * Growth. Referrals stay on the existing panel. Codes, announcements, and broadcasts are added here.
 */

import { useEffect, useState } from 'react';
import { GrowthPanel } from '@/components/growth/growth-panel';
import { Button, Card, EmptyState, ErrorState, SwitchField, TextAreaField, TextField } from '@/components/platform/ui';
import { displayDiscountValue } from '@/lib/display-labels';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES } from '@/lib/navigation';

type CodeRow = {
  readonly id: string;
  readonly code: string;
  readonly kind: string;
  readonly value: string;
  readonly usedCount: number;
  readonly maxUses: number | null;
  readonly active: boolean;
};

type GrowthPayload = {
  readonly role: 'owner' | 'reseller';
  readonly needsMigration: boolean;
  readonly codes: readonly CodeRow[];
  readonly events: { readonly enabled: boolean; readonly title: string; readonly body: string; readonly link: string };
  readonly recipients: number;
};

export function GrowthView({ focus = 'all' }: { readonly focus?: 'all' | 'marketing' | 'discounts' | 'broadcasts' } = {}): JSX.Element {
  const growth = useData<GrowthPayload>('/api/platform/growth');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [broadcast, setBroadcast] = useState('');
  const [note, setNote] = useState('');
  const [ready, setReady] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!growth.data || ready) return;
    setTitle(growth.data.events.title);
    setBody(growth.data.events.body);
    setLink(growth.data.events.link);
    setEnabled(growth.data.events.enabled);
    setReady(true);
  }, [growth.data, ready]);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl text-ink">{focus === 'discounts' ? 'Discounts' : focus === 'broadcasts' ? 'Broadcasts' : 'Marketing'}</h1>
        <p className="mt-1 text-sm text-ink-soft">{focus === 'discounts' ? 'Codes buyers can redeem.' : focus === 'broadcasts' ? 'Messages to your buyers.' : 'Referrals and announcements.'}</p>
      </header>
      {focus === 'marketing' || focus === 'all' ? (growth.data ? <GrowthPanel base={growth.data.role === 'owner' ? API_ROUTES.ownerGrowth : API_ROUTES.resellerGrowth} /> : null) : null}
      {growth.loading ? <p className="text-sm text-ink-soft">Loading codes…</p> : null}
      {growth.error ? <ErrorState message={growth.error.message} onRetry={growth.refetch} /> : null}
      {growth.data?.needsMigration ? <p className="text-sm text-ink">Discount codes need migration 0032.</p> : null}
      {focus === 'discounts' || focus === 'all' ? (
      <Card title="Discount codes">
        <div className="grid gap-2 sm:grid-cols-2">
          <TextField id="discount-code" label="Code" value={code} onChange={(event) => setCode(event.target.value)} />
          <TextField id="discount-value" label={kind === 'percent' ? 'Percent' : 'Amount in minor units'} value={value} onChange={(event) => setValue(event.target.value)} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant={kind === 'percent' ? 'primary' : 'secondary'} onClick={() => setKind('percent')}>Percent</Button>
          <Button variant={kind === 'fixed' ? 'primary' : 'secondary'} onClick={() => setKind('fixed')}>Fixed</Button>
          <Button onClick={() => { void runAction('/api/platform/growth', { method: 'POST', body: { action: 'code', code, kind, value, minOrderMinor: '0', maxUses: null, perCustomerLimit: 1 } }).then((result) => { setNote(result.ok ? 'Code saved.' : result.error.message); if (result.ok) growth.refetch(); }); }}>Add code</Button>
        </div>
        {growth.data && growth.data.codes.length === 0 ? <EmptyState title="No codes yet" message="Add a percent or a fixed amount. Buyers enter it in the bot." /> : null}
        <ul className="mt-3 space-y-2">
          {(growth.data?.codes ?? []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-num text-ink">{row.code}</span>
              <span className="text-ink-soft">{displayDiscountValue(row.kind, row.value)} · used {row.usedCount}{row.maxUses ? ` / ${row.maxUses}` : ''}</span>
              <Button variant="secondary" onClick={() => { void runAction('/api/platform/growth', { method: 'POST', body: { action: 'active', id: row.id, active: !row.active } }).then(() => growth.refetch()); }}>{row.active ? 'Turn off' : 'Turn on'}</Button>
            </li>
          ))}
        </ul>
      </Card>
      ) : null}
      {focus === 'marketing' || focus === 'all' ? (
      <Card title="Announcements">
        <div className="space-y-2">
          <SwitchField id="events-on" label="Show announcements" checked={enabled} onChange={setEnabled} />
          <TextField id="events-title" label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <TextAreaField id="events-body" label="Body" value={body} onChange={(event) => setBody(event.target.value)} />
          <TextField id="events-link" label="Link" value={link} onChange={(event) => setLink(event.target.value)} />
          <Button onClick={() => { void runAction('/api/platform/growth', { method: 'POST', body: { action: 'events', events: { enabled, title, body, link } } }).then((result) => setNote(result.ok ? 'Announcement saved.' : result.error.message)); }}>Save announcement</Button>
        </div>
      </Card>
      ) : null}
      {focus === 'broadcasts' || focus === 'all' ? (
      <Card title="Broadcast">
        <p className="text-sm text-ink-soft">{growth.data?.recipients ?? 0} buyers will receive this. Blocked buyers are left out.</p>
        <TextAreaField id="broadcast-body" label="Message" value={broadcast} onChange={(event) => setBroadcast(event.target.value)} />
        {armed ? (
          <Button onClick={() => { void runAction<{ sent?: number; failed?: number; recipients?: number }>('/api/platform/growth', { method: 'POST', body: { action: 'broadcast', body: broadcast, confirm: true } }).then((result) => { setArmed(false); setNote(result.ok ? `Sent ${result.data.sent ?? 0}. Failed ${result.data.failed ?? 0}. ${result.data.recipients ?? 0} were eligible.` : result.error.message); growth.refetch(); }); }}>Send now to {growth.data?.recipients ?? 0} buyers</Button>
        ) : (
          <Button variant="secondary" onClick={() => setArmed(true)}>Review send to {growth.data?.recipients ?? 0} buyers</Button>
        )}
      </Card>
      ) : null}
      {note ? <p className="text-sm text-ink">{note}</p> : null}
    </section>
  );
}
