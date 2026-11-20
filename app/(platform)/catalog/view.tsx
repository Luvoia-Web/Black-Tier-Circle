'use client';

/**
 * Products. Catalogue matches the reference. Inventory, pricing and suppliers
 * are the other tabs on this workspace.
 */

import { productInitials } from '@/lib/product-labels';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, LayoutGrid, List, Pause, Percent, Plus, Send, Tag, Trash2 } from 'lucide-react';
import { useSetDrawerBody } from '@/components/platform/drawer-body';
import { Button, Card, DataTable, ErrorState, Modal, Pagination, RelativeTime, SelectField, Skeleton, StatusPill, TextField, type Column } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { usdtToMinor } from '@/lib/money';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { CatalogRow, CatalogSummary, StockKind } from '@/modules/platform/catalog';
import { ProductEditor } from './editor';
import { InventorySection, PricingSection } from './sections';
import { SuppliersSection } from './suppliers';

type CatalogPayload = {
  readonly rows: readonly CatalogRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly suppliers: readonly { readonly id: string; readonly name: string }[];
  readonly categories: readonly string[];
  readonly summary: CatalogSummary;
  readonly role: 'owner' | 'reseller';
};

type DetailPayload = {
  readonly row: CatalogRow;
  readonly history: readonly { readonly id: string; readonly label: string; readonly at: string }[];
};

const STAGES: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'not_imported', label: 'Not imported' },
  { id: 'paused', label: 'Paused' },
  { id: 'out_of_stock', label: 'Out of stock' },
  { id: 'archived', label: 'Archived' },
];

const TILES = [
  'linear-gradient(145deg,#ffe3ec,#ffc2d4)',
  'linear-gradient(145deg,#ffead9,#ffcfa8)',
  'linear-gradient(145deg,#f3e9e2,#e2cfc0)',
  'linear-gradient(145deg,#e6efff,#c3d6ff)',
  'linear-gradient(145deg,#fff3cf,#ffe29a)',
  'linear-gradient(145deg,#e4fbef,#bdf0d6)',
  'linear-gradient(145deg,#efe6ff,#d6c4ff)',
  'linear-gradient(145deg,#ffe1e1,#ffbdbd)',
];

function money(minor: string): string {
  try {
    const whole = Number(BigInt(minor)) / 1_000_000;
    return whole.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return '0.00';
  }
}

function tile(title: string): string {
  let hash = 0;
  for (let index = 0; index < title.length; index += 1) {
    hash = (hash + title.charCodeAt(index)) % TILES.length;
  }
  return TILES[hash] ?? 'linear-gradient(145deg,#ffe3ec,#ffc2d4)';
}

function stockTone(kind: StockKind, count: number | null): 'ok' | 'warn' | 'fault' | 'neutral' {
  if (kind === 'out') return 'fault';
  if (kind === 'count' && (count ?? 0) < 20) return 'warn';
  if (kind === 'unknown') return 'neutral';
  return 'ok';
}

function stockText(row: CatalogRow): string {
  if (row.stockKind === 'unlimited') return '∞ in stock';
  if (row.stockKind === 'out') return 'Out of stock';
  if (row.stockKind === 'count') return `${row.stockCount ?? 0} in stock`;
  return row.stockLabel;
}

function ruleText(kind: 'percent' | 'fixed', value: string): string {
  return kind === 'fixed' ? `+${value}` : `${value}%`;
}

export function CatalogView(): JSX.Element {
  const params = useSearchParams();
  const router = useRouter();
  const setDrawer = useSetDrawerBody();
  const section = params.get('section') ?? 'catalogue';
  const listParams = new URLSearchParams(params.toString());
  if (section === 'catalogue' && !listParams.get('stage')) listParams.set('stage', 'live');
  const list = useData<CatalogPayload>(section === 'catalogue' ? `/api/platform/catalog?${listParams.toString()}` : '/api/platform/catalog?stage=live');
  const item = params.get('item');
  const creating = params.get('create') === '1';
  const editing = params.get('edit') === '1';
  const detail = useData<DetailPayload>(item ? `/api/platform/catalog/detail?id=${encodeURIComponent(item)}` : null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [ruleOpen, setRuleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const role = list.data?.role ?? 'owner';
  const summary = list.data?.summary;

  useEffect(() => {
    const stored = window.localStorage.getItem('btc-catalog-layout');
    if (stored === 'list' || stored === 'grid') setLayout(stored);
  }, []);

  const openEditor = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.set('edit', '1');
    const value = next.toString();
    router.replace(value ? `${ROUTES.platform.catalog}?${value}` : ROUTES.platform.catalog, { scroll: false });
  }, [params, router]);

  useEffect(() => {
    if (!item || editing || creating) {
      setDrawer(null);
      return;
    }
    setDrawer(
      detail.loading ? <Skeleton className="h-40 w-full" />
        : detail.error ? <ErrorState message={detail.error.message} onRetry={detail.refetch} />
          : detail.data ? (
            <ItemDrawer
              row={detail.data.row}
              role={role}
              history={detail.data.history}
              onEdit={openEditor}
            />
          ) : <p className="text-sm text-ink">This item is not in the catalog.</p>,
    );
    return () => setDrawer(null);
  }, [item, editing, creating, detail.loading, detail.error, detail.data, detail.refetch, setDrawer, openEditor, role]);

  function replace(next: URLSearchParams): void {
    const value = next.toString();
    router.replace(value ? `${ROUTES.platform.catalog}?${value}` : ROUTES.platform.catalog, { scroll: false });
  }

  function setParam(key: string, value: string): void {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page' && key !== 'item' && key !== 'edit' && key !== 'create') next.delete('page');
    replace(next);
  }

  function remember(next: 'grid' | 'list'): void {
    setLayout(next);
    window.localStorage.setItem('btc-catalog-layout', next);
  }

  const rows = list.data?.rows ?? [];
  const chosen = rows.filter((row) => selected.has(row.id));

  async function applyBulk(action: 'publish' | 'pause' | 'delete' | 'purge' | 'restore' | 'set-category' | 'rule', rule?: { wholesaleKind: 'percent' | 'fixed'; wholesaleValue: string; retailKind: 'percent' | 'fixed'; retailValue: string }): Promise<void> {
    if (chosen.length === 0) return;
    setBusy(true);
    setNotice(null);
    const productIds = chosen.map((row) => row.productId).filter((id): id is string => Boolean(id));
    const supplierIds = chosen.filter((row) => !row.productId && row.supplierProductId).map((row) => row.supplierProductId as string);
    if ((action === 'publish' || action === 'rule') && supplierIds.length > 0 && role === 'owner') {
      const published = await runAction(API_ROUTES.supplierBulkPublish, {
        body: {
          supplierProductIds: supplierIds.slice(0, 200),
          ...(rule ? {
            wholesaleMarkupKind: rule.wholesaleKind,
            wholesaleMarkupValue: Number(rule.wholesaleValue),
            retailMarkupKind: rule.retailKind,
            retailMarkupValue: Number(rule.retailValue),
          } : {}),
        },
      });
      if (!published.ok) {
        setNotice(published.error.message);
        setBusy(false);
        return;
      }
    }
    if (productIds.length > 0 && role === 'owner' && action !== 'rule') {
      const bulkAction = action === 'delete' ? 'archive' : action;
      const result = await runAction<{ results: Array<{ ok: boolean; error?: string }> }>(API_ROUTES.productBulk, {
        body: { productIds: productIds.slice(0, 200), action: bulkAction, ...(action === 'set-category' ? { category } : {}) },
      });
      if (!result.ok) {
        setNotice(result.error.message);
        setBusy(false);
        return;
      }
      const failed = result.data.results.find((item) => !item.ok);
      if (failed?.error) {
        setNotice(failed.error);
        setBusy(false);
        setDeleteOpen(false);
        list.refetch();
        return;
      }
    }
    if (action === 'rule' && rule && role === 'owner') {
      for (const id of productIds.slice(0, 25)) {
        const result = await runAction(API_ROUTES.product(id), {
          method: 'PATCH',
          body: {
            pricingMode: 'markup',
            wholesaleMarkupKind: rule.wholesaleKind,
            retailMarkupKind: rule.retailKind,
            wholesaleMarkupPercent: rule.wholesaleKind === 'percent' ? Number(rule.wholesaleValue) : null,
            retailMarkupPercent: rule.retailKind === 'percent' ? Number(rule.retailValue) : null,
            wholesaleMarkupMinor: rule.wholesaleKind === 'fixed' ? String(usdtToMinor(rule.wholesaleValue)) : null,
            retailMarkupMinor: rule.retailKind === 'fixed' ? String(usdtToMinor(rule.retailValue)) : null,
          },
        });
        if (!result.ok) {
          setNotice(result.error.message);
          break;
        }
      }
    }
    if (role === 'owner' && (action === 'pause' || action === 'delete')) {
      const route = action === 'pause' ? API_ROUTES.supplierPause : API_ROUTES.supplierReject;
      for (const id of supplierIds.slice(0, 25)) {
        await runAction(route(id));
      }
    }
    setBusy(false);
    setSelected(new Set());
    setCategoryOpen(false);
    setRuleOpen(false);
    setDeleteOpen(false);
    setNotice('Saved.');
    list.refetch();
  }

  const activeStage = params.get('stage') ?? 'live';
  const visibleStages = role === 'reseller'
    ? STAGES.filter((stage) => stage.id !== 'not_imported' && stage.id !== 'archived')
    : STAGES;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-medium tracking-tight text-ink">Products</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-soft">
            {summary ? (
              <>
                <b className="font-medium text-ink">{summary.itemCount}</b>
                {role === 'owner' ? <> items across {summary.supplierCount} suppliers</> : <> listings</>}
                {' · '}
                <b className="font-medium text-ink">{summary.liveCount}</b> live in your bots
              </>
            ) : 'Catalogue, stock and pricing'}
          </p>
        </div>
        {role === 'owner' ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setParam('create', '1')}><Plus className="h-4 w-4" aria-hidden="true" />New product</Button>
            <Button onClick={() => setParam('section', 'suppliers')}><Download className="h-4 w-4" aria-hidden="true" />Import from supplier</Button>
          </div>
        ) : null}
      </header>
      <div className="inline-flex rounded-xl border border-white/10 bg-black/25 p-1">
        {[
          { id: 'catalogue', label: 'Catalogue' },
          { id: 'inventory', label: 'Inventory' },
          { id: 'pricing', label: 'Pricing rules' },
        ].map((tab) => {
          const on = section === tab.id;
          return (
            <button key={tab.id} type="button" aria-pressed={on} className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[12.5px] ${on ? 'bg-white/12 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]' : 'text-ink-faint'}`} onClick={() => setParam('section', tab.id === 'catalogue' ? '' : tab.id)}>
              {tab.label}
              {tab.id === 'inventory' && summary ? <span className="rounded-pill bg-rose px-1.5 text-[11px] text-white">{summary.attentionCount}</span> : null}
            </button>
          );
        })}
      </div>
      {section === 'inventory' ? <InventorySection attention={params.get('attention') === '1'} onAttention={(on) => setParam('attention', on ? '1' : '')} /> : null}
      {section === 'pricing' ? <PricingSection /> : null}
      {section === 'suppliers' && role === 'owner' ? (
        <SuppliersSection
          panel={params.get('panel') ?? 'connected'}
          connect={params.get('connect') === '1'}
          supplierId={params.get('supplier')}
          onNavigate={setParam}
        />
      ) : null}
      {section === 'catalogue' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[340px] max-w-full [&_label]:sr-only [&_input]:h-8 [&_input]:min-h-8 [&_input]:rounded-xl">
              <TextField id="catalog-search" label="Search" placeholder="Search by name, SKU or supplier" defaultValue={params.get('search') ?? ''} onBlur={(event) => setParam('search', event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setParam('search', event.currentTarget.value); }} />
            </div>
            <div className="ml-auto inline-flex rounded-xl border border-white/10 bg-black/25 p-1">
              {visibleStages.map((stage) => (
                <button key={stage.id} type="button" aria-pressed={activeStage === stage.id} className={`h-8 rounded-lg px-3 text-[12.5px] ${activeStage === stage.id ? 'bg-white/12 text-ink' : 'text-ink-faint'}`} onClick={() => setParam('stage', stage.id === 'live' ? '' : stage.id)}>{stage.label}</button>
              ))}
            </div>
            <div className="inline-flex rounded-xl border border-white/10 bg-black/25 p-1">
              <button type="button" aria-pressed={layout === 'grid'} aria-label="Grid" className={`grid h-8 w-8 place-items-center rounded-lg ${layout === 'grid' ? 'bg-white/12 text-ink' : 'text-ink-faint'}`} onClick={() => remember('grid')}><LayoutGrid className="h-4 w-4" /></button>
              <button type="button" aria-pressed={layout === 'list'} aria-label="List" className={`grid h-8 w-8 place-items-center rounded-lg ${layout === 'list' ? 'bg-white/12 text-ink' : 'text-ink-faint'}`} onClick={() => remember('list')}><List className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CategoryChip label="Everything" count={summary?.liveCount ?? 0} on={!(params.get('category'))} onClick={() => setParam('category', '')} />
            {(summary?.categoryCounts ?? []).map((chip) => (
              <CategoryChip key={chip.name} label={chip.name} count={chip.count} on={params.get('category') === chip.name} onClick={() => setParam('category', chip.name)} />
            ))}
          </div>
          {notice ? <p className="text-sm text-ink">{notice}</p> : null}
          {list.loading && !list.data ? <Skeleton className="h-40 w-full" /> : null}
          {list.error && !list.data ? <ErrorState message={list.error.message} onRetry={list.refetch} /> : null}
          {list.data && rows.length === 0 ? <Card title="No products match"><p>Clear a filter, or import from a supplier.</p></Card> : null}
          {layout === 'grid' && rows.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {rows.map((row) => (
                <ProductCard
                  key={row.id}
                  row={row}
                  role={role}
                  selected={selected.has(row.id)}
                  onToggle={() => {
                    const next = new Set(selected);
                    if (next.has(row.id)) next.delete(row.id);
                    else next.add(row.id);
                    setSelected(next);
                  }}
                  onOpen={() => setParam('item', row.supplierProductId ?? row.productId ?? row.id)}
                  onSaved={list.refetch}
                />
              ))}
            </div>
          ) : null}
          {layout === 'list' && rows.length > 0 ? (
            <ProductTable rows={rows} role={role} selected={selected} onSelected={setSelected} onOpen={(row) => setParam('item', row.supplierProductId ?? row.productId ?? row.id)} onSaved={list.refetch} />
          ) : null}
          {list.data ? <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(page) => setParam('page', String(page))} /> : null}
          {chosen.length > 0 ? (
            <div className="sticky bottom-4 z-20 mx-auto flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-[rgb(30_16_24/0.82)] px-4 py-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur">
              <span className="text-[13.5px] text-ink"><b className="font-medium">{chosen.length} selected</b>{chosen[0] ? <span className="text-ink-soft"> · markup {ruleText(chosen[0].retailKind, chosen[0].retailValue)} retail, {ruleText(chosen[0].wholesaleKind, chosen[0].wholesaleValue)} wholesale</span> : null}</span>
              {role === 'owner' ? <Button variant="secondary" onClick={() => setCategoryOpen(true)}><Tag className="h-3.5 w-3.5" aria-hidden="true" />Set category</Button> : null}
              {role === 'owner' ? <Button variant="secondary" onClick={() => setRuleOpen(true)}><Percent className="h-3.5 w-3.5" aria-hidden="true" />Pricing rule</Button> : null}
              {role === 'owner' ? <Button variant="secondary" loading={busy} onClick={() => void applyBulk('pause')}><Pause className="h-3.5 w-3.5" aria-hidden="true" />Pause</Button> : null}
              {role === 'owner' ? <Button loading={busy} onClick={() => void applyBulk('publish')}><Send className="h-3.5 w-3.5" aria-hidden="true" />Publish to bot</Button> : null}
              {role === 'owner' && activeStage === 'archived' ? <Button variant="secondary" onClick={() => void applyBulk('restore')}>Restore</Button> : null}
              {role === 'owner' && activeStage === 'archived' ? <Button variant="destructive" onClick={() => setDeleteOpen(true)}>Delete permanently</Button> : null}
              {role === 'owner' && activeStage !== 'archived' ? <Button variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Delete</Button> : null}
            </div>
          ) : null}
        </>
      ) : null}
      <Modal open={creating || editing} wide title={creating ? 'New product' : 'Edit product'} onClose={() => { setParam('create', ''); setParam('edit', ''); }}>
        {editing && detail.loading ? <Skeleton className="h-40 w-full" /> : null}
        {editing && !detail.loading && !detail.data?.row.productId && role === 'owner' ? <p className="text-sm text-ink">Publish this supplier item before editing it.</p> : null}
        {creating || (editing && (role === 'reseller' ? detail.data?.row.listingId : detail.data?.row.productId)) ? (
          <ProductEditor
            productId={creating ? null : detail.data?.row.productId ?? null}
            listingId={detail.data?.row.listingId ?? null}
            role={role}
            onClose={() => { setParam('create', ''); setParam('edit', ''); }}
            onSaved={() => { list.refetch(); detail.refetch(); }}
          />
        ) : null}
      </Modal>
      <Modal open={categoryOpen} title="Set category" onClose={() => setCategoryOpen(false)}>
        <TextField id="bulk-category" label="Category" value={category} onChange={(event) => setCategory(event.target.value)} />
        <div className="mt-3"><Button loading={busy} onClick={() => void applyBulk('set-category')}>Save category</Button></div>
      </Modal>
      <Modal open={ruleOpen} title="Pricing rule" onClose={() => setRuleOpen(false)}>
        <RuleForm busy={busy} onSave={(rule) => void applyBulk('rule', rule)} />
      </Modal>
      <Modal open={deleteOpen} title="Delete products" onClose={() => setDeleteOpen(false)}>
        <p className="text-sm text-ink">{chosen.length} selected {chosen.length === 1 ? 'product' : 'products'} will be archived and leave the active list. Restore them from Archived.</p>
        <div className="mt-3 flex gap-2">
          <Button variant="destructive" loading={busy} onClick={() => void applyBulk(activeStage === 'archived' ? 'purge' : 'delete')}>{activeStage === 'archived' ? 'Delete permanently' : 'Archive'}</Button>
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
        </div>
      </Modal>
    </section>
  );
}

function CategoryChip({ label, count, on, onClick }: { readonly label: string; readonly count: number; readonly on: boolean; readonly onClick: () => void }): JSX.Element {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`inline-flex h-8 items-center gap-2 rounded-xl border px-3 text-[12.5px] ${on ? 'border-rose/50 bg-rose/25 text-white' : 'border-white/10 bg-white/[0.06] text-ink-soft'}`}>
      {label}
      <span className={`rounded-pill px-1.5 text-[11px] ${on ? 'bg-rose/30 text-white' : 'bg-white/10 text-ink-soft'}`}>{count}</span>
    </button>
  );
}

function ProductCard({ row, role, selected, onToggle, onOpen, onSaved }: { readonly row: CatalogRow; readonly role: 'owner' | 'reseller'; readonly selected: boolean; readonly onToggle: () => void; readonly onOpen: () => void; readonly onSaved: () => void }): JSX.Element {
  return (
    <article className={`glass-card rounded-lg p-3 ${selected ? 'border-rose/60 shadow-[0_0_0_1px_rgba(255,95,143,0.35)]' : ''}`}>
      <button type="button" className="relative block h-[122px] w-full overflow-hidden rounded-[14px]" onClick={onOpen} aria-label={`Open ${row.title}`}>
        {row.imageUrl ? (
          <span className="block h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(row.imageUrl)})` }} />
        ) : (
          <span className="grid h-full w-full place-items-center text-[28px] font-medium text-[#5a2038]" style={{ background: tile(row.title) }}>{productInitials(row.title)}</span>
        )}
        <input type="checkbox" aria-label={`Select ${row.title}`} checked={selected} className="absolute left-2 top-2 h-4 w-4" onClick={(event) => event.stopPropagation()} onChange={onToggle} />
      </button>
      <button type="button" className="mt-2 block text-left text-sm font-medium text-ink" onClick={onOpen}>{row.title}</button>
      <p className="text-xs text-ink-faint">{row.category || 'Uncategorised'} · {row.deliveryLabel}{role === 'owner' ? ` · ${row.supplierName}` : ''}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <InlinePrice row={row} onSaved={onSaved} />
        <StatusPill tone={stockTone(row.stockKind, row.stockCount)}>{stockText(row)}</StatusPill>
      </div>
      <InlineStatus row={row} onSaved={onSaved} />
      {role === 'owner' && !row.listingId ? <InlineRule row={row} onSaved={onSaved} /> : null}
    </article>
  );
}

function ProductTable({ rows, role, selected, onSelected, onOpen, onSaved }: { readonly rows: readonly CatalogRow[]; readonly role: 'owner' | 'reseller'; readonly selected: ReadonlySet<string>; readonly onSelected: (next: ReadonlySet<string>) => void; readonly onOpen: (row: CatalogRow) => void; readonly onSaved: () => void }): JSX.Element {
  const columns: Column<CatalogRow>[] = [
    { id: 'title', header: 'Product', render: (row) => <span className="inline-flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-md text-xs font-medium text-[#5a2038]" style={{ background: tile(row.title) }}>{productInitials(row.title)}</span>{row.title}</span> },
    { id: 'category', header: 'Category', render: (row) => row.category || '—' },
    { id: 'delivery', header: 'Delivery', render: (row) => row.deliveryLabel },
    ...(role === 'owner' ? [{ id: 'supplier', header: 'Supplier', render: (row: CatalogRow) => row.supplierName }] : []),
    { id: 'price', header: 'Price', numeric: true, render: (row) => <InlinePrice row={row} onSaved={onSaved} /> },
    { id: 'stock', header: 'Stock', render: (row) => <StatusPill tone={stockTone(row.stockKind, row.stockCount)}>{stockText(row)}</StatusPill> },
    { id: 'margin', header: 'Margin', numeric: true, render: (row) => row.marginLabel },
    ...(role === 'owner' ? [{ id: 'rule', header: 'Markup rule', render: (row: CatalogRow) => <InlineRule row={row} onSaved={onSaved} /> }] : []),
  ];
  return (
    <DataTable caption="Products" columns={columns} rows={rows} rowKey={(row) => row.id} selected={selected} onSelected={onSelected} onOpen={onOpen} emptyTitle="No products match" emptyMessage="Clear a filter, or import from a supplier." />
  );
}

function InlinePrice({ row, onSaved }: { readonly row: CatalogRow; readonly onSaved: () => void }): JSX.Element {
  const [value, setValue] = useState(money(row.priceMinor));
  async function save(): Promise<void> {
    try {
      const minor = String(usdtToMinor(value));
      const result = row.listingId
        ? await runAction(API_ROUTES.resellerListing(row.listingId), { method: 'PATCH', body: { retailPriceStr: minor } })
        : row.productId
          ? await runAction(API_ROUTES.product(row.productId), { method: 'PATCH', body: { retailPriceStr: minor } })
          : { ok: false as const, error: { message: 'Import this item before setting a price.', code: 'NO_PRODUCT' } };
      if (!result.ok) return;
      onSaved();
    } catch {
      setValue(money(row.priceMinor));
    }
  }
  return (
    <label className="text-xs text-ink-faint">
      <span className="sr-only">Price for {row.title}</span>
      <input className="w-16 bg-transparent text-right font-num text-sm text-ink" value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => void save()} />
      <span className="ml-1">USDT</span>
    </label>
  );
}

function InlineStatus({ row, onSaved }: { readonly row: CatalogRow; readonly onSaved: () => void }): JSX.Element {
  async function save(status: string): Promise<void> {
    if (row.listingId) {
      await runAction(API_ROUTES.resellerListing(row.listingId), { method: 'PATCH', body: { isVisible: status !== 'paused' } });
    } else if (row.productId && (status === 'published' || status === 'paused' || status === 'archived')) {
      await runAction(API_ROUTES.productStatus(row.productId), { method: 'PATCH', body: { status } });
    }
    onSaved();
  }
  const value = row.stage === 'paused' ? 'paused' : row.stage === 'archived' ? 'archived' : row.stage === 'not_imported' ? 'not_imported' : 'published';
  return (
    <label className="mt-2 block text-xs text-ink-faint">
      Status
      <select aria-label={`Status for ${row.title}`} className="mt-1 w-full rounded-md border border-white/10 bg-transparent px-2 py-1 text-sm text-ink" value={value} onChange={(event) => void save(event.target.value)}>
        <option value="published">Live</option>
        <option value="paused">Paused</option>
        <option value="archived">Archived</option>
        {value === 'not_imported' ? <option value="not_imported">Not imported</option> : null}
      </select>
    </label>
  );
}

function InlineRule({ row, onSaved }: { readonly row: CatalogRow; readonly onSaved: () => void }): JSX.Element {
  const [wholesaleKind, setWholesaleKind] = useState(row.wholesaleKind);
  const [wholesaleValue, setWholesaleValue] = useState(row.wholesaleValue);
  const [retailKind, setRetailKind] = useState(row.retailKind);
  const [retailValue, setRetailValue] = useState(row.retailValue);
  async function save(): Promise<void> {
    if (!row.productId) return;
    try {
      await runAction(API_ROUTES.product(row.productId), {
        method: 'PATCH',
        body: {
          pricingMode: 'markup',
          wholesaleMarkupKind: wholesaleKind,
          retailMarkupKind: retailKind,
          wholesaleMarkupPercent: wholesaleKind === 'percent' ? Number(wholesaleValue) : null,
          retailMarkupPercent: retailKind === 'percent' ? Number(retailValue) : null,
          wholesaleMarkupMinor: wholesaleKind === 'fixed' ? String(usdtToMinor(wholesaleValue)) : null,
          retailMarkupMinor: retailKind === 'fixed' ? String(usdtToMinor(retailValue)) : null,
        },
      });
      onSaved();
    } catch {
      setWholesaleValue(row.wholesaleValue);
    }
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-ink-faint">
      <span>W</span>
      <select aria-label={`Wholesale kind for ${row.title}`} className="bg-transparent text-ink" value={wholesaleKind} onChange={(event) => setWholesaleKind(event.target.value === 'fixed' ? 'fixed' : 'percent')}>
        <option value="percent">%</option>
        <option value="fixed">Fixed</option>
      </select>
      <input aria-label={`Wholesale value for ${row.title}`} className="w-12 bg-transparent font-num text-ink" value={wholesaleValue} onChange={(event) => setWholesaleValue(event.target.value)} onBlur={() => void save()} />
      <span>R {ruleText(retailKind, retailValue)}</span>
      <select aria-label={`Retail kind for ${row.title}`} className="bg-transparent text-ink" value={retailKind} onChange={(event) => setRetailKind(event.target.value === 'fixed' ? 'fixed' : 'percent')}>
        <option value="percent">%</option>
        <option value="fixed">Fixed</option>
      </select>
      <input aria-label={`Retail value for ${row.title}`} className="w-12 bg-transparent font-num text-ink" value={retailValue} onChange={(event) => setRetailValue(event.target.value)} onBlur={() => void save()} />
    </div>
  );
}

function RuleForm({ busy, onSave }: { readonly busy: boolean; readonly onSave: (rule: { wholesaleKind: 'percent' | 'fixed'; wholesaleValue: string; retailKind: 'percent' | 'fixed'; retailValue: string }) => void }): JSX.Element {
  const [wholesaleKind, setWholesaleKind] = useState<'percent' | 'fixed'>('percent');
  const [wholesaleValue, setWholesaleValue] = useState('50');
  const [retailKind, setRetailKind] = useState<'percent' | 'fixed'>('percent');
  const [retailValue, setRetailValue] = useState('50');
  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave({ wholesaleKind, wholesaleValue, retailKind, retailValue }); }}>
      <SelectField id="bulk-wholesale-kind" label="Wholesale" value={wholesaleKind} options={[{ value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed USDT' }]} onChange={(event) => setWholesaleKind(event.target.value === 'fixed' ? 'fixed' : 'percent')} />
      <TextField id="bulk-wholesale-value" label="Wholesale value" value={wholesaleValue} onChange={(event) => setWholesaleValue(event.target.value)} />
      <SelectField id="bulk-retail-kind" label="Retail" value={retailKind} options={[{ value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed USDT' }]} onChange={(event) => setRetailKind(event.target.value === 'fixed' ? 'fixed' : 'percent')} />
      <TextField id="bulk-retail-value" label="Retail value" value={retailValue} onChange={(event) => setRetailValue(event.target.value)} />
      <Button type="submit" loading={busy}>Apply rule</Button>
    </form>
  );
}

function ItemDrawer({ row, role, history, onEdit }: { readonly row: CatalogRow; readonly role: 'owner' | 'reseller'; readonly history: DetailPayload['history']; readonly onEdit: () => void }): JSX.Element {
  return (
    <div className="space-y-3 text-ink">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base">{row.title}</p>
          <p className="font-mono text-xs text-ink-faint">{row.sku || row.id}</p>
        </div>
        <Button variant="secondary" onClick={onEdit}>Edit</Button>
      </div>
      <StatusPill tone={stockTone(row.stockKind, row.stockCount)}>{stockText(row)}</StatusPill>
      <p className="text-sm text-ink-soft">{row.category || 'Uncategorised'} · {row.deliveryLabel}{role === 'owner' ? ` · ${row.supplierName}` : ''}</p>
      <p className="font-num text-sm">{money(row.priceMinor)} USDT · margin {row.marginLabel}</p>
      {role === 'owner' && !row.listingId ? (
        <p className="text-sm text-ink-soft">Wholesale {ruleText(row.wholesaleKind, row.wholesaleValue)} · retail {ruleText(row.retailKind, row.retailValue)}</p>
      ) : null}
      <h3 className="text-sm">History</h3>
      {history.length === 0 ? <p className="text-sm text-ink-soft">No orders yet.</p> : (
        <ul className="space-y-2">
          {history.map((entry) => (
            <li key={entry.id} className="text-sm">
              {entry.label}
              <span className="mt-0.5 block text-xs text-ink-faint"><RelativeTime value={entry.at} /></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
