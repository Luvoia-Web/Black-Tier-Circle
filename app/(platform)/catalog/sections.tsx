'use client';

/**
 * Inventory and pricing rules. The reorder point is 10 units.
 * A cost preview uses the same markup guard as supplier re-pricing.
 */

import { useState, type FormEvent } from 'react';
import { AlertTriangle, Boxes, Wallet } from 'lucide-react';
import { Button, DataTable, ErrorState, SelectField, Skeleton, StatTile, TextField, type Column } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES } from '@/lib/navigation';
import type { InventoryPage, InventoryRow } from '@/modules/platform/inventory';
import type { PricingPage } from '@/modules/platform/pricing';
import { marginBelowMinimum, priceWithRule, type MarkupSide } from '@/modules/supplier/markup-rules';

function money(minor: string): string {
  try {
    const whole = Number(BigInt(minor)) / 1_000_000;
    return `${whole.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  } catch {
    return '0.00 USDT';
  }
}

function initials(title: string): string {
  const parts = title.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : (parts[0] ?? 'PR').slice(0, 2)).toUpperCase();
}

export function InventorySection({ attention, onAttention }: { readonly attention: boolean; readonly onAttention: (on: boolean) => void }): JSX.Element {
  const page = useData<InventoryPage>(`/api/platform/catalog?section=inventory${attention ? '&attention=1' : ''}`);
  if (page.loading && !page.data) return <Skeleton className="h-40 w-full" />;
  if (page.error && !page.data) return <ErrorState message={page.error.message} onRetry={page.refetch} />;
  const data = page.data;
  if (!data) return <Skeleton className="h-40 w-full" />;
  const columns: Column<InventoryRow>[] = [
    { id: 'product', header: 'Product', render: (row) => <span className="inline-flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-md bg-rose/15 text-xs text-ink">{initials(row.title)}</span>{row.title}</span> },
    { id: 'level', header: 'Level', render: (row) => <Level row={row} /> },
    { id: 'sold', header: 'Sold, 30 days', numeric: true, render: (row) => String(row.sold30) },
    { id: 'days', header: 'Days left', numeric: true, render: (row) => row.daysLeft === null ? '—' : String(row.daysLeft) },
    { id: 'qty', header: 'On hand', render: (row) => <Quantity row={row} onSaved={page.refetch} /> },
    { id: 'point', header: 'Reorder point', render: (row) => <ReorderPoint row={row} locked={data.needsMigration || data.role !== 'owner'} onSaved={page.refetch} /> },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <StatTile label="Stock value at cost" value={money(data.stockValueMinor)} icon={Wallet} tone="rose" />
        <StatTile label="Units on hand" value={String(data.unitsOnHand)} icon={Boxes} tone="sky" />
        <StatTile label="Needs attention" value={String(data.attentionCount)} icon={AlertTriangle} tone="amber" />
      </div>
      {data.needsMigration ? <p className="text-sm text-ink">Needs migration 0034. Every product uses the shared reorder point of 10 until products.reorder_point exists.</p> : null}
      <button type="button" aria-pressed={attention} className={`h-8 rounded-xl border px-3 text-[12.5px] ${attention ? 'border-rose/50 bg-rose/20 text-ink' : 'border-white/10 text-ink-soft'}`} onClick={() => onAttention(!attention)}>
        Needs attention ({data.attentionCount})
      </button>
      <DataTable caption="Inventory" columns={columns} rows={data.rows} rowKey={(row) => row.id} emptyTitle="No stock to show" emptyMessage="Published products with a stock count will appear here." />
    </div>
  );
}

function Level({ row }: { readonly row: InventoryRow }): JSX.Element {
  const width = row.unlimited || row.onHand === null ? 100 : Math.max(4, Math.min(100, Math.round((row.onHand / row.reorderPoint) * 100)));
  const low = !row.unlimited && (row.onHand ?? 0) <= row.reorderPoint;
  return (
    <span className="block w-28">
      <span className="block h-2 overflow-hidden rounded-md bg-white/10">
        <span className={`block h-full ${low ? 'bg-amber' : 'bg-mint'}`} style={{ width: `${width}%` }} />
      </span>
      <span className="mt-1 block text-[11px] text-ink-faint">{row.unlimited ? 'Unlimited' : `${row.onHand ?? 0} / ${row.reorderPoint}`}</span>
    </span>
  );
}

function ReorderPoint({ row, locked, onSaved }: { readonly row: InventoryRow; readonly locked: boolean; readonly onSaved: () => void }): JSX.Element {
  const [value, setValue] = useState(String(row.reorderPoint));
  if (locked) return <span className="font-num text-sm text-ink">{row.reorderPoint}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <input className="h-8 w-16 rounded-md border border-white/10 bg-white/5 px-2 font-num text-sm text-ink" inputMode="numeric" aria-label={`Reorder point for ${row.title}`} value={value} onChange={(event) => setValue(event.target.value)} />
      <Button variant="secondary" onClick={() => { void runAction('/api/platform/catalog', { method: 'PATCH', body: { productId: row.id, reorderPoint: Number(value) } }).then(() => onSaved()); }}>Save</Button>
    </span>
  );
}

function Quantity({ row, onSaved }: { readonly row: InventoryRow; readonly onSaved: () => void }): JSX.Element {
  const [value, setValue] = useState(row.onHand ?? 0);
  if (row.mode === 'supplier') return <span className="text-sm text-ink">Supplier {row.supplierLive}</span>;
  if (row.mode === 'units') return <span className="text-sm text-ink">{row.unlimited ? '∞' : `${row.onHand ?? 0} left`}</span>;
  async function save(next: number): Promise<void> {
    const count = Math.max(0, next);
    setValue(count);
    await runAction(API_ROUTES.product(row.id), { method: 'PATCH', body: { stockUnlimited: false, stockCount: count } });
    onSaved();
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="secondary" aria-label={`Decrease ${row.title}`} onClick={() => void save(value - 1)}>-</Button>
      <span className="w-8 text-center font-num text-sm text-ink">{value}</span>
      <Button variant="secondary" aria-label={`Increase ${row.title}`} onClick={() => void save(value + 1)}>+</Button>
    </span>
  );
}

export function PricingSection(): JSX.Element {
  const page = useData<PricingPage>('/api/platform/pricing');
  const [fromCost, setFromCost] = useState('1.00');
  const [toCost, setToCost] = useState('1.20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [applyNote, setApplyNote] = useState<string | null>(null);
  if (page.loading && !page.data) return <Skeleton className="h-40 w-full" />;
  if (page.error || !page.data) return <ErrorState message={page.error?.message ?? 'Pricing did not load.'} onRetry={page.refetch} />;
  const data = page.data;

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await runAction('/api/platform/pricing', {
      method: 'PUT',
      body: {
        wholesaleKind: String(form.get('wholesaleKind')),
        wholesaleValue: String(form.get('wholesaleValue')),
        retailKind: String(form.get('retailKind')),
        retailValue: String(form.get('retailValue')),
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    page.refetch();
  }

  async function applyDefaults(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await runAction('/api/platform/pricing', { method: 'POST' });
    setBusy(false);
    setConfirmApply(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const body = result.data as { repriced?: number; paused?: readonly { title: string }[] };
    const paused = body.paused ?? [];
    const names = paused.map((item) => item.title).slice(0, 8).join(', ');
    setApplyNote(`Repriced ${body.repriced ?? 0}. Paused ${paused.length}${names ? `: ${names}` : ''}.`);
    page.refetch();
  }

  const wholesale = side(data.wholesaleKind, data.wholesaleValue);
  const retail = side(data.retailKind, data.retailValue);
  const preview = previewOf(fromCost, toCost, wholesale, retail, data.minMarginPercent);

  return (
    <div className="space-y-4">
      <form className="glass-card grid gap-3 rounded-lg p-4 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
        <p className="sm:col-span-2 text-sm text-ink">Store default. Minimum margin {data.minMarginPercent}%.</p>
        <SelectField id="wholesale-kind" name="wholesaleKind" label="Wholesale" defaultValue={data.wholesaleKind} options={[{ value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed USDT' }]} />
        <TextField id="wholesale-value" name="wholesaleValue" label="Wholesale value" defaultValue={data.wholesaleValue} />
        <SelectField id="retail-kind" name="retailKind" label="Retail" defaultValue={data.retailKind} options={[{ value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed USDT' }]} />
        <TextField id="retail-value" name="retailValue" label="Retail value" defaultValue={data.retailValue} />
        {error ? <p className="sm:col-span-2 text-sm" style={{ color: 'var(--fault-ink)' }}>{error}</p> : null}
        <Button type="submit" loading={busy}>Save defaults</Button>
      </form>
      <div className="glass-card space-y-3 rounded-lg p-4">
        <p className="text-sm text-ink">If a supplier cost moves, this is the price the current rule would write.</p>
        <div className="flex flex-wrap gap-3">
          <TextField id="cost-from" label="Cost now" value={fromCost} onChange={(event) => setFromCost(event.target.value)} />
          <TextField id="cost-to" label="Cost after" value={toCost} onChange={(event) => setToCost(event.target.value)} />
        </div>
        {preview ? (
          <p className="text-sm text-ink">
            Wholesale {preview.fromWholesale} → {preview.toWholesale}. Retail {preview.fromRetail} → {preview.toRetail}.
            {preview.blocked ? ' That retail price is at or below cost, or under the minimum margin, so it would not be saved.' : ' The margin stays above the minimum.'}
          </p>
        ) : <p className="text-sm text-ink-soft">Enter both costs to preview.</p>}
      </div>
      <div className="glass-card space-y-3 rounded-lg p-4">
        <p className="text-sm text-ink">{data.defaultCount} {data.defaultCount === 1 ? 'product uses' : 'products use'} the store default. Products with their own rule stay as they are.</p>
        {data.defaultPreview.length === 0 ? <p className="text-sm text-ink-soft">Nothing on the default rule has a supplier cost to reprice.</p> : (
          <ul className="space-y-1 text-sm text-ink">
            {data.defaultPreview.map((row) => (
              <li key={row.id}>
                {row.title}: wholesale {row.fromWholesale} → {row.toWholesale}, retail {row.fromRetail} → {row.toRetail}
                {row.blocked ? '. This one would break a guard, so it would be paused.' : '.'}
              </li>
            ))}
          </ul>
        )}
        {applyNote ? <p className="text-sm text-ink">{applyNote}</p> : null}
        {confirmApply ? (
          <div className="flex flex-wrap gap-2">
            <Button loading={busy} onClick={() => void applyDefaults()}>Confirm reprice</Button>
            <Button variant="secondary" onClick={() => setConfirmApply(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="secondary" disabled={data.defaultCount === 0} onClick={() => setConfirmApply(true)}>Apply to products on the default rule</Button>
        )}
      </div>
      <DataTable
        caption="Products overriding the store rule"
        columns={[
          { id: 'title', header: 'Product', render: (row) => row.title },
          { id: 'wholesale', header: 'Wholesale', render: (row) => `${row.wholesaleValue}${row.wholesaleKind === 'percent' ? '%' : ' USDT'}` },
          { id: 'retail', header: 'Retail', render: (row) => `${row.retailValue}${row.retailKind === 'percent' ? '%' : ' USDT'}` },
        ]}
        rows={data.overrides}
        rowKey={(row) => row.id}
        emptyTitle="No overrides"
        emptyMessage="Every product is using the store markup."
      />
    </div>
  );
}

function side(kind: 'percent' | 'fixed', value: string): MarkupSide {
  if (kind === 'fixed') {
    try {
      const [whole, frac = ''] = value.split('.');
      const minor = BigInt(whole || '0') * 1_000_000n + BigInt((frac + '000000').slice(0, 6));
      return { kind, percent: null, minor };
    } catch {
      return { kind, percent: null, minor: 0n };
    }
  }
  return { kind, percent: Number(value) || 0, minor: null };
}

function previewOf(from: string, to: string, wholesale: MarkupSide, retail: MarkupSide, minMargin: number): { fromWholesale: string; fromRetail: string; toWholesale: string; toRetail: string; blocked: boolean } | null {
  if (!/^\d+(\.\d+)?$/.test(from) || !/^\d+(\.\d+)?$/.test(to)) return null;
  const fromMinor = costMinor(from);
  const toMinor = costMinor(to);
  const fromPrices = { wholesale: priceWithRule(fromMinor, wholesale), retail: priceWithRule(fromMinor, retail) };
  const toPrices = { wholesale: priceWithRule(toMinor, wholesale), retail: priceWithRule(toMinor, retail) };
  const blocked = toPrices.wholesale <= toMinor || toPrices.retail <= toMinor || marginBelowMinimum(toPrices.retail, toMinor, minMargin);
  return {
    fromWholesale: money(fromPrices.wholesale.toString()),
    fromRetail: money(fromPrices.retail.toString()),
    toWholesale: money(toPrices.wholesale.toString()),
    toRetail: money(toPrices.retail.toString()),
    blocked,
  };
}

function costMinor(value: string): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole || '0') * 1_000_000n + BigInt((frac + '000000').slice(0, 6));
}
