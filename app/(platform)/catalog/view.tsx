'use client';

/**
 * Catalog table. Filters live in the URL. Opening a row opens the shell drawer.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSetDrawerBody } from '@/components/platform/drawer-body';
import { writeSelection } from '@/components/platform/areas';
import {
  Button,
  DataTable,
  ErrorState,
  FilterBar,
  Pagination,
  SelectField,
  StatusPill,
  TextField,
  type Column,
} from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { usdtToMinor } from '@/lib/money';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { CatalogRow, CatalogStage } from '@/modules/platform/catalog';

type CatalogPayload = {
  readonly rows: readonly CatalogRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly suppliers: readonly { readonly id: string; readonly name: string }[];
  readonly categories: readonly string[];
  readonly role: 'owner' | 'reseller';
};

type DetailPayload = {
  readonly row: CatalogRow;
  readonly history: readonly { readonly id: string; readonly label: string; readonly at: string }[];
};

const STAGES: { value: string; label: string }[] = [
  { value: '', label: 'Every stage' },
  { value: 'not_imported', label: 'Not imported' },
  { value: 'imported', label: 'Imported' },
  { value: 'live', label: 'Live' },
  { value: 'paused', label: 'Paused' },
  { value: 'out_of_stock', label: 'Out of stock' },
];

function tone(stage: CatalogStage): 'ok' | 'warn' | 'fault' | 'neutral' {
  if (stage === 'live') return 'ok';
  if (stage === 'out_of_stock') return 'fault';
  if (stage === 'paused' || stage === 'not_imported') return 'warn';
  return 'neutral';
}

function label(stage: CatalogStage): string {
  return STAGES.find((item) => item.value === stage)?.label ?? stage;
}

export function CatalogView(): JSX.Element {
  const params = useSearchParams();
  const router = useRouter();
  const setDrawer = useSetDrawerBody();
  const query = params.toString();
  const list = useData<CatalogPayload>(`/api/platform/catalog${query ? `?${query}` : ''}`);
  const item = params.get('item');
  const detail = useData<DetailPayload>(item ? `/api/platform/catalog/detail?id=${encodeURIComponent(item)}` : null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (!item) {
      setDrawer(null);
      return;
    }
    setDrawer(
      detail.loading ? <p>Loading this item…</p>
        : detail.error ? <ErrorState message={detail.error.message} onRetry={detail.refetch} />
          : detail.data ? <ItemDetail row={detail.data.row} history={detail.data.history} onSaved={detail.refetch} />
            : <p>This item is not in the catalog.</p>,
    );
    return () => setDrawer(null);
  }, [item, detail.loading, detail.error, detail.data, detail.refetch, setDrawer]);

  function replace(next: URLSearchParams): void {
    const value = next.toString();
    router.replace(value ? `${ROUTES.platform.catalog}?${value}` : ROUTES.platform.catalog, { scroll: false });
  }

  function setFilter(key: string, value: string): void {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    replace(next);
  }

  function open(row: CatalogRow): void {
    const next = new URLSearchParams(params.toString());
    next.set('item', row.supplierProductId ?? row.productId ?? row.id);
    replace(next);
  }

  async function bulk(action: 'publish' | 'pause' | 'delete' | 'set-category'): Promise<void> {
    const rows = (list.data?.rows ?? []).filter((row) => selected.has(row.id));
    if (rows.length === 0) {
      setNotice('Select at least one row first.');
      return;
    }
    setBusy(true);
    setNotice(null);
    const productIds = rows.map((row) => row.productId).filter((id): id is string => Boolean(id));
    const supplierIds = rows.filter((row) => !row.productId && row.supplierProductId).map((row) => row.supplierProductId as string);
    let failed = 0;
    if (action === 'publish' && supplierIds.length > 0) {
      const published = await runAction(API_ROUTES.supplierBulkPublish, { body: { supplierProductIds: supplierIds.slice(0, 200) } });
      if (!published.ok) failed += supplierIds.length;
    }
    if (productIds.length > 0) {
      const result = await runAction(API_ROUTES.productBulk, {
        body: { productIds: productIds.slice(0, 200), action, ...(action === 'set-category' ? { category } : {}) },
      });
      if (!result.ok) {
        setNotice(result.error.message);
        setBusy(false);
        return;
      }
    }
    if (action === 'pause' || action === 'delete') {
      const route = action === 'pause' ? API_ROUTES.supplierPause : API_ROUTES.supplierReject;
      for (const id of supplierIds.slice(0, 25)) {
        const result = await runAction(route(id));
        if (!result.ok) failed += 1;
      }
    }
    setBusy(false);
    setNotice(failed > 0 ? `${failed} rows did not update. The rest were saved.` : 'Bulk action finished.');
    setSelected(new Set());
    writeSelection([]);
    list.refetch();
  }

  const columns: Column<CatalogRow>[] = [
    { id: 'title', header: 'Item', sortable: true, render: (row) => row.title },
    { id: 'supplier', header: 'Supplier', render: (row) => row.supplierName },
    { id: 'stage', header: 'Stage', render: (row) => <StatusPill tone={tone(row.stage)}>{label(row.stage)}</StatusPill> },
    { id: 'stock', header: 'Stock', numeric: true, sortable: true, render: (row) => row.stockLabel },
    {
      id: 'rule',
      header: 'Pricing rule',
      render: (row) => <RuleEditor row={row} onSaved={list.refetch} />,
    },
  ];

  const rows = list.data?.rows ?? [];

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl text-ink">Catalog</h1>
        <p className="mt-1 text-sm text-ink-soft">Every supplier item and published product, with its stage.</p>
      </header>
      <FilterBar>
        <TextField id="catalog-search" label="Search" placeholder="Name or SKU" defaultValue={params.get('search') ?? ''} onBlur={(event) => setFilter('search', event.target.value)} />
        <SelectField id="catalog-supplier" label="Supplier" value={params.get('supplier') ?? ''} options={[{ value: '', label: 'Every supplier' }, { value: 'own', label: 'Own products' }, ...(list.data?.suppliers ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name }))]} onChange={(event) => setFilter('supplier', event.target.value)} />
        <SelectField id="catalog-stage" label="Stage" value={params.get('stage') ?? ''} options={STAGES} onChange={(event) => setFilter('stage', event.target.value)} />
        <SelectField id="catalog-stock" label="Stock" value={params.get('stock') ?? ''} options={[{ value: '', label: 'Any stock' }, { value: 'in', label: 'In stock' }, { value: 'out', label: 'Out of stock' }]} onChange={(event) => setFilter('stock', event.target.value)} />
        <SelectField id="catalog-category" label="Category" value={params.get('category') ?? ''} options={[{ value: '', label: 'Every category' }, ...(list.data?.categories ?? []).map((item) => ({ value: item, label: item }))]} onChange={(event) => setFilter('category', event.target.value)} />
        <SelectField id="catalog-sort" label="Sort" value={params.get('sort') ?? 'title'} options={[{ value: 'title', label: 'Name' }, { value: 'stock', label: 'Stock' }, { value: 'created', label: 'Newest' }]} onChange={(event) => setFilter('sort', event.target.value)} />
      </FilterBar>
      {notice ? <p className="text-sm text-ink">{notice}</p> : null}
      <DataTable
        caption="Catalog"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        error={list.error?.message ?? null}
        onRetry={list.refetch}
        emptyTitle="No items match"
        emptyMessage="Clear a filter, or sync suppliers to pull the catalog."
        sort={{ id: params.get('sort') ?? 'title', direction: 'asc' }}
        onSort={(id) => setFilter('sort', id === 'title' ? 'title' : id === 'stock' ? 'stock' : 'created')}
        selected={selected}
        onSelected={(next) => {
          setSelected(next);
          writeSelection(rows.filter((row) => next.has(row.id) && row.supplierProductId).map((row) => row.supplierProductId as string));
        }}
        onOpen={open}
        bulk={list.data?.role === 'owner' ? (
          <>
            <Button variant="secondary" loading={busy} onClick={() => void bulk('publish')}>Publish</Button>
            <Button variant="secondary" loading={busy} onClick={() => void bulk('pause')}>Pause</Button>
            <TextField id="bulk-category" label="Category" value={category} onChange={(event) => setCategory(event.target.value)} />
            <Button variant="secondary" loading={busy} onClick={() => void bulk('set-category')}>Set category</Button>
            <Button variant="destructive" loading={busy} onClick={() => void bulk('delete')}>Delete</Button>
          </>
        ) : undefined}
      />
      {list.data ? (
        <Pagination
          page={list.data.page}
          pageSize={list.data.pageSize}
          total={list.data.total}
          onPage={(page) => setFilter('page', String(page))}
          onPageSize={(size) => setFilter('pageSize', String(size))}
        />
      ) : null}
    </section>
  );
}

function RuleEditor({ row, onSaved }: { readonly row: CatalogRow; readonly onSaved: () => void }): JSX.Element {
  const [wholesaleKind, setWholesaleKind] = useState(row.wholesaleKind);
  const [wholesaleValue, setWholesaleValue] = useState(row.wholesaleValue);
  const [retailKind, setRetailKind] = useState(row.retailKind);
  const [retailValue, setRetailValue] = useState(row.retailValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    if (!row.productId) {
      if (!row.supplierProductId) {
        setError('This row has no product to price.');
        setBusy(false);
        return;
      }
      const result = await runAction(API_ROUTES.supplierBulkPublish, {
        body: {
          supplierProductIds: [row.supplierProductId],
          wholesaleMarkupKind: wholesaleKind,
          wholesaleMarkupValue: Number(wholesaleValue),
          retailMarkupKind: retailKind,
          retailMarkupValue: Number(retailValue),
        },
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onSaved();
      return;
    }
    try {
      const result = await runAction(API_ROUTES.product(row.productId), {
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
      setBusy(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onSaved();
    } catch (cause: unknown) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : 'Enter a price with up to 6 decimals.');
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2">
      <label className="text-xs text-ink-faint">
        Wholesale
        <span className="mt-1 flex gap-1">
          <select aria-label={`Wholesale kind for ${row.title}`} className="min-h-11 rounded-md border border-stroke bg-raised px-2 text-sm" value={wholesaleKind} onChange={(event) => setWholesaleKind(event.target.value === 'fixed' ? 'fixed' : 'percent')}>
            <option value="percent">Percent</option>
            <option value="fixed">Fixed</option>
          </select>
          <input aria-label={`Wholesale value for ${row.title}`} className="w-20 min-h-11 rounded-md border border-stroke bg-raised px-2 text-right font-num text-sm" value={wholesaleValue} onChange={(event) => setWholesaleValue(event.target.value)} />
        </span>
      </label>
      <label className="text-xs text-ink-faint">
        Retail
        <span className="mt-1 flex gap-1">
          <select aria-label={`Retail kind for ${row.title}`} className="min-h-11 rounded-md border border-stroke bg-raised px-2 text-sm" value={retailKind} onChange={(event) => setRetailKind(event.target.value === 'fixed' ? 'fixed' : 'percent')}>
            <option value="percent">Percent</option>
            <option value="fixed">Fixed</option>
          </select>
          <input aria-label={`Retail value for ${row.title}`} className="w-20 min-h-11 rounded-md border border-stroke bg-raised px-2 text-right font-num text-sm" value={retailValue} onChange={(event) => setRetailValue(event.target.value)} />
        </span>
      </label>
      <Button variant="secondary" loading={busy} onClick={() => void save()}>{row.productId ? 'Save rule' : 'Publish with this rule'}</Button>
      {error ? <p className="w-full text-xs" style={{ color: 'var(--fault-ink)' }}>{error}</p> : null}
    </div>
  );
}

function ItemDetail({ row, history, onSaved }: { readonly row: CatalogRow; readonly history: DetailPayload['history']; readonly onSaved: () => void }): JSX.Element {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink">{row.title}</p>
      <p className="font-num text-xs text-ink-faint">{row.sku || row.id}</p>
      <StatusPill tone={tone(row.stage)}>{label(row.stage)}</StatusPill>
      <p className="text-sm text-ink-soft">{row.supplierName} · {row.stockLabel}</p>
      <RuleEditor row={row} onSaved={onSaved} />
      <h3 className="text-sm text-ink">History</h3>
      {history.length === 0 ? <p className="text-sm text-ink-soft">No orders yet. A completed order will show up here.</p> : (
        <ul className="space-y-2">
          {history.map((entry) => (
            <li key={entry.id} className="text-sm text-ink">
              <span className="font-num">{entry.label}</span>
              <span className="mt-0.5 block text-xs text-ink-faint">{entry.at}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
