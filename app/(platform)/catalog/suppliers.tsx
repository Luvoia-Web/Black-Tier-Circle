'use client';

/**
 * Supplier screens: connected accounts, import, the order monitor, and health.
 * Writes go through the existing supplier routes.
 */

import { useState } from 'react';
import { Button, DataTable, ErrorState, Pagination, RelativeTime, SelectField, Skeleton, Sparkline, StatusPill, TextField, type Column } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES } from '@/lib/navigation';
import type { SupplierDesk } from '@/modules/platform/supplier-desk';

type BalanceRow = {
  readonly supplierId: string;
  readonly supplierName: string;
  readonly status: string;
  readonly balance: string;
  readonly lastSyncAt: string | null;
  readonly productCount: number;
};

type BalancePayload = { readonly balances: readonly BalanceRow[]; readonly pendingReviewCount: number };

type ImportRow = {
  readonly id: string;
  readonly name: string;
  readonly supplierSku: string;
  readonly supplierPrice: string;
  readonly supplierPublicPrice: string | null;
  readonly inStock: boolean;
  readonly stockCount: number | null;
  readonly soldCount: number;
  readonly deliveryType: string;
  readonly durationText: string | null;
  readonly warrantyText: string | null;
  readonly typeLabel: string | null;
  readonly lastSyncedAt: string | null;
  readonly reviewStatus: string;
  readonly productId: string | null;
  readonly imageUrl: string | null;
};

type ImportPayload = {
  readonly products: readonly ImportRow[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
};

const PANELS = [
  { id: 'connected', label: 'Connected' },
  { id: 'import', label: 'Import catalog' },
  { id: 'orders', label: 'Supplier orders' },
  { id: 'health', label: 'Health' },
] as const;

export function SuppliersSection({
  panel,
  connect,
  supplierId,
  onNavigate,
}: {
  readonly panel: string;
  readonly connect: boolean;
  readonly supplierId: string | null;
  readonly onNavigate: (key: string, value: string) => void;
}): JSX.Element {
  const balances = useData<BalancePayload>('/api/supplier/balance');
  const active = panel === 'import' || panel === 'orders' || panel === 'health' ? panel : 'connected';
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-white/10 bg-black/25 p-1">
        {PANELS.map((item) => (
          <button key={item.id} type="button" aria-pressed={active === item.id} className={`h-8 rounded-lg px-3 text-[12.5px] ${active === item.id ? 'bg-white/12 text-ink' : 'text-ink-faint'}`} onClick={() => onNavigate('panel', item.id === 'connected' ? '' : item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {active === 'connected' ? (
        <Connected
          balances={balances}
          connect={connect}
          supplierId={supplierId}
          onConnect={() => onNavigate('connect', '1')}
          onCloseConnect={() => onNavigate('connect', '')}
          onOpen={(id) => onNavigate('supplier', id)}
        />
      ) : null}
      {active === 'import' ? <Import supplierId={supplierId ?? balances.data?.balances[0]?.supplierId ?? null} suppliers={balances.data?.balances ?? []} onSupplier={(id) => onNavigate('supplier', id)} /> : null}
      {active === 'orders' ? <Orders /> : null}
      {active === 'health' ? <Health /> : null}
    </div>
  );
}

function Connected({
  balances,
  connect,
  supplierId,
  onConnect,
  onCloseConnect,
  onOpen,
}: {
  readonly balances: ReturnType<typeof useData<BalancePayload>>;
  readonly connect: boolean;
  readonly supplierId: string | null;
  readonly onConnect: () => void;
  readonly onCloseConnect: () => void;
  readonly onOpen: (id: string) => void;
}): JSX.Element {
  const [notice, setNotice] = useState<string | null>(null);
  if (balances.loading && !balances.data) return <Skeleton className="h-32 w-full" />;
  if (balances.error) return <ErrorState message={balances.error.message} onRetry={balances.refetch} />;
  const rows = balances.data?.balances ?? [];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={onConnect}>Connect a supplier</Button></div>
      {connect ? <ConnectForm onDone={() => { onCloseConnect(); balances.refetch(); }} /> : null}
      {notice ? <p className="text-sm text-ink">{notice}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => {
          const low = Number(row.balance) < 5;
          return (
            <article key={row.supplierId} className={`glass-card space-y-2 rounded-lg p-4 ${supplierId === row.supplierId ? 'border-rose/50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="text-left text-sm text-ink" onClick={() => onOpen(row.supplierId)}>{row.supplierName}</button>
                <StatusPill tone={row.status === 'active' ? 'ok' : row.status === 'paused' ? 'warn' : 'fault'}>{row.status}</StatusPill>
              </div>
              <p className="font-num text-sm text-ink">{row.balance} USDT {low ? <span className="text-amber">· low against open supplier orders</span> : null}</p>
              <p className="text-xs text-ink-faint">{row.productCount} products · last sync {row.lastSyncAt ? <RelativeTime value={row.lastSyncAt} /> : 'never'}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { void runAction(API_ROUTES.supplierSync, { body: { supplierId: row.supplierId } }).then((result) => { setNotice(result.ok ? 'Sync finished.' : result.error.message); balances.refetch(); }); }}>Sync now</Button>
                <Button variant="secondary" onClick={() => onOpen(row.supplierId)}>Settings</Button>
              </div>
              {supplierId === row.supplierId ? <SettingsForm supplierId={row.supplierId} name={row.supplierName} status={row.status} onDone={() => { setNotice('Supplier updated.'); balances.refetch(); }} /> : null}
            </article>
          );
        })}
      </div>
      {rows.length === 0 ? <p className="text-sm text-ink-soft">No supplier is connected yet.</p> : null}
    </div>
  );
}

function ConnectForm({ onDone }: { readonly onDone: () => void }): JSX.Element {
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(false);
  async function run(save: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await runAction(API_ROUTES.supplierConnect, { body: { name, apiKey, endpoint, save } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      setTested(false);
      return;
    }
    if (!save) {
      setTested(true);
      return;
    }
    onDone();
  }
  return (
    <form className="glass-card grid gap-3 rounded-lg p-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void run(tested); }}>
      <TextField id="supplier-name" label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
      <TextField id="supplier-key" label="API key" type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setTested(false); }} required />
      <TextField id="supplier-endpoint" label="Endpoint" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
      {error ? <p className="sm:col-span-2 text-sm" style={{ color: 'var(--fault-ink)' }}>{error}</p> : null}
      {tested ? <p className="sm:col-span-2 text-sm text-ink">The key works. Save it to connect.</p> : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" loading={busy} onClick={() => void run(false)}>Test key</Button>
        <Button type="submit" loading={busy} disabled={!tested}>Save supplier</Button>
      </div>
    </form>
  );
}

function SettingsForm({ supplierId, name, status, onDone }: { readonly supplierId: string; readonly name: string; readonly status: string; readonly onDone: () => void }): JSX.Element {
  const [nextName, setNextName] = useState(name);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function patch(body: Record<string, string>): Promise<void> {
    const result = await runAction(API_ROUTES.supplierSettings(supplierId), { method: 'PATCH', body });
    if (!result.ok) setError(result.error.message);
    else onDone();
  }
  return (
    <div className="space-y-2 border-t border-white/10 pt-2">
      <TextField id={`rename-${supplierId}`} label="Name" value={nextName} onChange={(event) => setNextName(event.target.value)} />
      <TextField id={`key-${supplierId}`} label="New API key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
      {error ? <p className="text-sm" style={{ color: 'var(--fault-ink)' }}>{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void patch({ name: nextName })}>Rename</Button>
        <Button variant="secondary" disabled={apiKey.length < 8} onClick={() => void patch({ apiKey })}>Rotate key</Button>
        <Button variant="secondary" onClick={() => void patch({ status: status === 'paused' ? 'active' : 'paused' })}>{status === 'paused' ? 'Resume' : 'Pause'}</Button>
      </div>
    </div>
  );
}

function Import({ supplierId, suppliers, onSupplier }: { readonly supplierId: string | null; readonly suppliers: readonly BalanceRow[]; readonly onSupplier: (id: string) => void }): JSX.Element {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [wholesaleKind, setWholesaleKind] = useState<'percent' | 'fixed'>('percent');
  const [wholesaleValue, setWholesaleValue] = useState('50');
  const [retailKind, setRetailKind] = useState<'percent' | 'fixed'>('percent');
  const [retailValue, setRetailValue] = useState('50');
  const [category, setCategory] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const query = new URLSearchParams({ supplierId: supplierId ?? '', page: String(page), limit: '24', sort });
  if (filter === 'published' || filter === 'not_published') query.set('pushed', filter);
  if (filter === 'rejected' || filter === 'paused') query.set('status', filter);
  if (filter === 'in' || filter === 'out') query.set('stock', filter);
  const list = useData<ImportPayload>(supplierId ? `/api/supplier/products?${query.toString()}` : null);
  const columns: Column<ImportRow>[] = [
    { id: 'name', header: 'Product', render: (row) => row.name },
    { id: 'cost', header: 'Cost', numeric: true, render: (row) => row.supplierPrice },
    { id: 'public', header: 'Public price', numeric: true, render: (row) => row.supplierPublicPrice ?? '—' },
    { id: 'stock', header: 'Stock', render: (row) => row.stockCount === null ? (row.inStock ? '∞' : 'Out') : String(row.stockCount) },
    { id: 'sold', header: 'Sold', numeric: true, render: (row) => String(row.soldCount) },
    { id: 'delivery', header: 'Delivery', render: (row) => row.deliveryType },
    { id: 'card', header: 'Card', render: (row) => [row.durationText, row.warrantyText, row.typeLabel].filter(Boolean).join(' · ') || '—' },
    { id: 'synced', header: 'Synced', render: (row) => row.lastSyncedAt ? <RelativeTime value={row.lastSyncedAt} /> : '—' },
    { id: 'state', header: 'State', render: (row) => row.productId ? <a className="underline" href={`/catalog?item=${row.productId}`}>Published</a> : <span>Not published</span> },
  ];
  async function publish(): Promise<void> {
    const ids = [...selected].slice(0, 200);
    if (ids.length === 0) return;
    const result = await runAction(API_ROUTES.supplierBulkPublish, {
      body: {
        supplierProductIds: ids,
        wholesaleMarkupKind: wholesaleKind,
        wholesaleMarkupValue: Number(wholesaleValue),
        retailMarkupKind: retailKind,
        retailMarkupValue: Number(retailValue),
        ...(category ? { buyerCategory: category } : {}),
      },
    });
    setNotice(result.ok ? 'Published.' : result.error.message);
    if (result.ok) {
      setSelected(new Set());
      list.refetch();
    }
  }
  if (!supplierId) return <p className="text-sm text-ink-soft">Connect a supplier before importing.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <SelectField id="import-supplier" label="Supplier" value={supplierId} options={suppliers.map((row) => ({ value: row.supplierId, label: row.supplierName }))} onChange={(event) => { setPage(1); onSupplier(event.target.value); }} />
        <SelectField id="import-filter" label="Filter" value={filter} options={[{ value: 'all', label: 'All' }, { value: 'published', label: 'Published' }, { value: 'not_published', label: 'Not published' }, { value: 'rejected', label: 'Rejected' }, { value: 'paused', label: 'Paused' }, { value: 'in', label: 'In stock' }, { value: 'out', label: 'Out of stock' }]} onChange={(event) => { setPage(1); setFilter(event.target.value); }} />
        <SelectField id="import-sort" label="Sort" value={sort} options={[{ value: 'name', label: 'Name' }, { value: 'cost', label: 'Cost' }, { value: 'stock', label: 'Stock' }, { value: 'synced', label: 'Last synced' }]} onChange={(event) => setSort(event.target.value)} />
      </div>
      {notice ? <p className="text-sm text-ink">{notice}</p> : null}
      {list.loading && !list.data ? <Skeleton className="h-32 w-full" /> : null}
      {list.error ? <ErrorState message={list.error.message} onRetry={list.refetch} /> : null}
      {list.data ? (
        <>
          <DataTable caption="Supplier catalog" columns={columns} rows={list.data.products} rowKey={(row) => row.id} selected={selected} onSelected={setSelected} emptyTitle="No supplier products" emptyMessage="Sync the supplier, then filter again." />
          <Pagination page={list.data.page} pageSize={list.data.limit} total={list.data.total} onPage={setPage} />
          <div className="flex flex-wrap items-end gap-2">
            <SelectField id="import-wholesale-kind" label="Wholesale" value={wholesaleKind} options={[{ value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed USDT' }]} onChange={(event) => setWholesaleKind(event.target.value === 'fixed' ? 'fixed' : 'percent')} />
            <TextField id="import-wholesale-value" label="Wholesale value" value={wholesaleValue} onChange={(event) => setWholesaleValue(event.target.value)} />
            <SelectField id="import-retail-kind" label="Retail" value={retailKind} options={[{ value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed USDT' }]} onChange={(event) => setRetailKind(event.target.value === 'fixed' ? 'fixed' : 'percent')} />
            <TextField id="import-retail-value" label="Retail value" value={retailValue} onChange={(event) => setRetailValue(event.target.value)} />
            <TextField id="import-category" label="Category" value={category} onChange={(event) => setCategory(event.target.value)} />
            <Button onClick={() => void publish()}>Publish selected</Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Orders(): JSX.Element {
  const desk = useData<SupplierDesk>('/api/platform/catalog?section=suppliers');
  const [delivery, setDelivery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  if (desk.loading && !desk.data) return <Skeleton className="h-32 w-full" />;
  if (desk.error || !desk.data || !Array.isArray(desk.data.orders)) return <ErrorState message={desk.error?.message ?? 'Supplier orders did not load.'} onRetry={desk.refetch} />;
  async function act(orderId: string, kind: 'complete' | 'fail' | 'resubmit' | 'reconcile'): Promise<void> {
    const url = kind === 'complete' ? API_ROUTES.supplierManualComplete(orderId)
      : kind === 'fail' ? API_ROUTES.supplierManualFail(orderId)
        : kind === 'resubmit' ? API_ROUTES.supplierResubmit(orderId)
          : API_ROUTES.supplierForceReconcile(orderId);
    const body = kind === 'complete' ? { deliveryData: delivery } : kind === 'fail' ? { note: delivery } : undefined;
    const result = await runAction(url, body ? { body } : undefined);
    setNotice(result.ok ? 'Saved.' : result.error.message);
    if (result.ok) desk.refetch();
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">{desk.data.pendingOrders} orders are still with a supplier. {desk.data.note}</p>
      {notice ? <p className="text-sm text-ink">{notice}</p> : null}
      <TextField id="supplier-delivery" label="Delivery text for manual complete" value={delivery} onChange={(event) => setDelivery(event.target.value)} />
      <DataTable
        caption="Supplier orders"
        columns={[
          { id: 'order', header: 'Order', render: (row) => <a className="font-mono underline" href={`/orders?order=${row.orderId}`}>{row.orderId.slice(0, 8)}</a> },
          { id: 'status', header: 'Status', render: (row) => row.status },
          { id: 'error', header: 'Error', render: (row) => row.error ?? '—' },
          { id: 'when', header: 'Started', render: (row) => row.startedAt ? <RelativeTime value={row.startedAt} /> : '—' },
          { id: 'actions', header: 'Actions', render: (row) => (
            <span className="flex flex-wrap gap-1">
              <Button variant="secondary" onClick={() => void act(row.orderId, 'complete')}>Complete</Button>
              <Button variant="secondary" onClick={() => void act(row.orderId, 'fail')}>Fail</Button>
              <Button variant="secondary" onClick={() => void act(row.orderId, 'resubmit')}>Resubmit</Button>
              <Button variant="secondary" onClick={() => void act(row.orderId, 'reconcile')}>Reconcile</Button>
            </span>
          ) },
        ]}
        rows={desk.data.orders}
        rowKey={(row) => row.orderId}
        emptyTitle="No supplier orders"
        emptyMessage="Orders sent to a supplier will show up here."
      />
    </div>
  );
}

function Health(): JSX.Element {
  const desk = useData<SupplierDesk>('/api/platform/catalog?section=suppliers');
  if (desk.loading && !desk.data) return <Skeleton className="h-32 w-full" />;
  if (desk.error || !desk.data || !Array.isArray(desk.data.health)) return <ErrorState message={desk.error?.message ?? 'Health did not load.'} onRetry={desk.refetch} />;
  const health = desk.data;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">{health.note}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {health.health.map((row) => (
          <article key={row.supplierId} className="glass-card space-y-1 rounded-lg p-4">
            <p className="text-sm text-ink">{row.name}</p>
            <p className="text-xs text-ink-faint">Balance {row.balance} USDT · {row.status}</p>
            {row.balanceTrend.length > 1 ? <Sparkline data={row.balanceTrend} /> : <p className="text-xs text-ink-faint">{health.needsMigration ? 'Needs migration 0034 before the balance trend can be drawn.' : 'One reading so far. The trend appears after the next balance check.'}</p>}
            <p className="text-xs text-ink-faint">Last sync {row.lastSyncAt ? <RelativeTime value={row.lastSyncAt} /> : 'never'}{row.lastSyncError ? ` · ${row.lastSyncError}` : ''}</p>
            <p className="text-xs text-ink-faint">Error rate {row.errorRate === null ? '—' : `${row.errorRate}%`} · average fulfilment {row.averageMinutes === null ? '—' : `${row.averageMinutes} min`}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
