/**
 * @file app/(dashboard)/owner/products/page.tsx
 *
 * Owner product list with status filter tabs.
 *
 * @module Dashboard
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProductStatusBadge } from '@/components/catalog/product-status-badge';
import { DocumentTitle } from '@/components/ui/DocumentTitle';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageError } from '@/components/ui/PageError';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { formatUsdt, usdtToMinor } from '@/lib/money';
import { productTypeLabel, productTypeTone } from '@/lib/product-labels';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { ProductStatus } from '@/modules/catalog/types';

type ProductRow = {
  readonly id: string;
  readonly sku: string;
  readonly title: string;
  readonly category: string | null;
  readonly deliveryType: string;
  readonly wholesalePriceMinor: string;
  readonly retailPriceMinor: string;
  readonly status: ProductStatus;
  readonly stockUnlimited: boolean;
  readonly stockCount: number | null;
  readonly supplierId?: string | null;
  readonly supplierName?: string | null;
  readonly typeLabel?: string;
  readonly salesCount?: number;
  readonly pricingMode?: string;
  readonly wholesaleMarkupKind?: string | null;
  readonly wholesaleMarkupPercent?: number | null;
  readonly wholesaleMarkupMinor?: string | null;
  readonly retailMarkupKind?: string | null;
  readonly retailMarkupPercent?: number | null;
  readonly retailMarkupMinor?: string | null;
};

const TABS: ReadonlyArray<{ id: 'all' | ProductStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'published', label: 'Published' },
  { id: 'paused', label: 'Paused' },
  { id: 'archived', label: 'Archived' },
];

/**
 * Owner catalog list with status filters and publish/pause actions.
 */
export default function OwnerProductsPage(): JSX.Element {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [salesSort, setSalesSort] = useState<'none' | 'desc' | 'asc'>('none');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(24);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [stock, setStock] = useState('all');
  const [sort, setSort] = useState('title');
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ draft: 0, published: 0, paused: 0, archived: 0 });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort,
        stock,
      });
      if (tab !== 'all') {
        query.set('status', tab);
      }
      if (search.trim()) {
        query.set('search', search.trim());
      }
      if (category.trim()) {
        query.set('category', category.trim());
      }
      if (supplierId.trim()) {
        query.set('supplierId', supplierId.trim());
      }
      const response = await fetch(`${API_ROUTES.products}?${query.toString()}`);
      const json = (await response.json()) as {
        success: boolean;
        data?: { products: ProductRow[]; total: number; counts: { draft: number; published: number; paused: number; archived: number } };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load products');
        setRows([]);
        return;
      }
      setRows(json.data.products);
      setTotal(json.data.total);
      setCounts(json.data.counts);
      setSelected(new Set());
    } catch {
      setError('Unable to load products');
    } finally {
      setLoading(false);
    }
  }, [category, limit, page, search, sort, stock, supplierId, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = useCallback(async (productId: string, status: 'published' | 'paused'): Promise<void> => {
    const previous = rows.find((row) => row.id === productId)?.status;
    setRows((current) => current.map((row) => (row.id === productId ? { ...row, status } : row)));
    setPendingId(productId);
    try {
      const response = await fetch(API_ROUTES.productStatus(productId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        if (previous) {
          setRows((current) => current.map((row) => (row.id === productId ? { ...row, status: previous } : row)));
        }
        toast.error(json.error?.message ?? 'Unable to update status');
        return;
      }
      toast.success(status === 'published' ? 'Product published' : 'Product paused');
    } catch {
      if (previous) {
        setRows((current) => current.map((row) => (row.id === productId ? { ...row, status: previous } : row)));
      }
      toast.error('Unable to update status');
    } finally {
      setPendingId(null);
    }
  }, [rows]);

  async function savePrice(row: ProductRow, field: 'wholesale' | 'retail', value: string): Promise<void> {
    try {
      const minor = usdtToMinor(value).toString();
      const response = await fetch(API_ROUTES.product(row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(field === 'wholesale' ? { wholesalePriceStr: minor } : { retailPriceStr: minor }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        toast.error(json.error?.message ?? 'Unable to update price');
        return;
      }
      await load();
    } catch {
      toast.error('Enter a valid USDT amount');
    }
  }

  async function saveMarkup(row: ProductRow, kind: 'percent' | 'fixed', value: string): Promise<void> {
    const body =
      kind === 'fixed'
        ? {
            pricingMode: 'markup',
            wholesaleMarkupKind: 'fixed',
            retailMarkupKind: 'fixed',
            wholesaleMarkupMinor: usdtToMinor(value).toString(),
            retailMarkupMinor: usdtToMinor(value).toString(),
          }
        : {
            pricingMode: 'markup',
            wholesaleMarkupKind: 'percent',
            retailMarkupKind: 'percent',
            wholesaleMarkupPercent: Number(value),
            retailMarkupPercent: Number(value),
          };
    const response = await fetch(API_ROUTES.product(row.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      toast.error(json.error?.message ?? 'Unable to update markup');
      return;
    }
    await load();
  }

  async function selectAllFiltered(): Promise<void> {
    const ids: string[] = [];
    let nextPage = 1;
    let seen = 0;
    while (ids.length < 200 && nextPage <= 3) {
      const query = new URLSearchParams({
        page: String(nextPage),
        limit: '96',
        sort,
        stock,
      });
      if (tab !== 'all') {
        query.set('status', tab);
      }
      if (search.trim()) {
        query.set('search', search.trim());
      }
      if (category.trim()) {
        query.set('category', category.trim());
      }
      if (supplierId.trim()) {
        query.set('supplierId', supplierId.trim());
      }
      const response = await fetch(`${API_ROUTES.products}?${query.toString()}`);
      const json = (await response.json()) as {
        success: boolean;
        data?: { products: ProductRow[]; total: number };
      };
      if (!json.success || !json.data) {
        break;
      }
      ids.push(...json.data.products.map((row) => row.id));
      seen = json.data.total;
      if (ids.length >= seen) {
        break;
      }
      nextPage += 1;
    }
    setSelected(new Set(ids.slice(0, 200)));
  }

  async function runBulk(action: 'delete' | 'publish' | 'pause' | 'archive' | 'set-category'): Promise<void> {
    const ids = rows.filter((row) => selected.has(row.id)).map((row) => row.id);
    if (ids.length === 0) {
      toast.error('Select at least one product');
      return;
    }
    if (action === 'delete') {
      const sold = rows.filter((row) => selected.has(row.id) && (row.salesCount ?? 0) > 0).length;
      const message =
        sold > 0
          ? `Delete ${ids.length} products? ${sold} have sales and will be archived instead of deleted.`
          : `Delete ${ids.length} products? Products with no orders will be removed.`;
      if (!window.confirm(message)) {
        return;
      }
    }
    const response = await fetch(API_ROUTES.productBulk, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productIds: ids,
        action,
        ...(action === 'set-category' ? { category: bulkCategory } : {}),
      }),
    });
    const json = (await response.json()) as {
      success: boolean;
      data?: { results: Array<{ ok: boolean; action?: string }> };
      error?: { message: string };
    };
    if (!json.success || !json.data) {
      toast.error(json.error?.message ?? 'Unable to update products');
      return;
    }
    const failed = json.data.results.filter((result) => !result.ok).length;
    const archived = json.data.results.filter((result) => result.action === 'archived').length;
    if (failed === 0) {
      toast.success(archived > 0 ? `Updated ${ids.length}. Archived ${archived}.` : `Updated ${ids.length}`);
    } else {
      toast.error(`${failed} of ${ids.length} could not be updated`);
    }
    await load();
  }

  const columns: ReadonlyArray<DataTableColumn<ProductRow>> = useMemo(
    () => [
      { key: 'select', header: 'Select', render: (row) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.title}`}
          checked={selected.has(row.id)}
          onChange={() => {
            setSelected((current) => {
              const next = new Set(current);
              if (next.has(row.id)) {
                next.delete(row.id);
              } else {
                next.add(row.id);
              }
              return next;
            });
          }}
        />
      ) },
      { key: 'title', header: 'Title', render: (row) => row.title },
      { key: 'category', header: 'Category', render: (row) => row.category ?? '—' },
      {
        key: 'delivery',
        header: 'Type',
        render: (row) => {
          const label = row.typeLabel ?? productTypeLabel(row);
          return <span className={productTypeTone(label)}>{label}</span>;
        },
      },
      {
        key: 'sales',
        header: 'Sales',
        render: (row) => {
          const count = row.salesCount ?? 0;
          return count === 0 ? <span className="text-[var(--text-3)]">No sales yet</span> : `${count} sales`;
        },
      },
      {
        key: 'wholesale',
        header: 'Wholesale',
        render: (row) => (
          <input
            className="btc-input w-24"
            aria-label={`Wholesale for ${row.title}`}
            defaultValue={formatUsdt(BigInt(row.wholesalePriceMinor)).replace(' USDT', '')}
            onBlur={(event) => void savePrice(row, 'wholesale', event.target.value)}
          />
        ),
      },
      {
        key: 'retail',
        header: 'Retail',
        render: (row) => (
          <input
            className="btc-input w-24"
            aria-label={`Retail for ${row.title}`}
            defaultValue={formatUsdt(BigInt(row.retailPriceMinor)).replace(' USDT', '')}
            onBlur={(event) => void savePrice(row, 'retail', event.target.value)}
          />
        ),
      },
      {
        key: 'markup',
        header: 'Markup',
        render: (row) => {
          const label =
            row.pricingMode === 'markup'
              ? `W ${row.wholesaleMarkupKind === 'fixed' ? row.wholesaleMarkupMinor : `${row.wholesaleMarkupPercent ?? ''}%`} · R ${row.retailMarkupKind === 'fixed' ? row.retailMarkupMinor : `${row.retailMarkupPercent ?? ''}%`}`
              : 'Manual';
          return (
            <span className="flex flex-col gap-1">
              <span>{label}</span>
              <input
                className="btc-input w-20"
                aria-label={`Markup percent for ${row.title}`}
                placeholder="%"
                onBlur={(event) => {
                  if (event.target.value.trim()) {
                    void saveMarkup(row, 'percent', event.target.value);
                  }
                }}
              />
            </span>
          );
        },
      },
      { key: 'status', header: 'Status', render: (row) => <ProductStatusBadge status={row.status} /> },
      {
        key: 'stock',
        header: 'Stock',
        render: (row) => (row.stockUnlimited ? 'Unlimited' : String(row.stockCount ?? 0)),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (row) => {
          const busy = pendingId === row.id;
          const toggleLabel = row.status === 'published' ? 'Pause' : 'Publish';
          const canToggle = row.status === 'draft' || row.status === 'published' || row.status === 'paused';
          return (
            <div className="flex flex-wrap gap-2">
              <Link
                href={ROUTES.owner.productEdit(row.id)}
                className="text-xs font-medium text-[var(--accent-soft)] hover:text-[var(--accent)]"
              >
                Edit
              </Link>
              <Link
                href={ROUTES.owner.productDetail(row.id)}
                className="text-xs font-medium text-[var(--accent-soft)] hover:text-[var(--accent)]"
              >
                View details
              </Link>
              {canToggle ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void setStatus(row.id, row.status === 'published' ? 'paused' : 'published')
                  }
                  className="text-xs font-medium text-[var(--text-2)] hover:text-white disabled:opacity-60"
                >
                  {busy ? 'Updating…' : toggleLabel}
                </button>
              ) : null}
            </div>
          );
        },
      },
    ],
    // The price editors call the latest load through the render that built the row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingId, selected, setStatus],
  );

  const visible = useMemo(() => {
    if (salesSort === 'none') {
      return rows;
    }
    return [...rows].sort((left, right) => {
      const delta = (left.salesCount ?? 0) - (right.salesCount ?? 0);
      return salesSort === 'asc' ? delta : -delta;
    });
  }, [rows, salesSort]);

  return (
    <>
      <DocumentTitle title="Products — Black Tier Circle" />
      <PageHeader
        title="Products"
        description="Create and manage digital products, prices, and availability"
        actions={
          <Link
            href={ROUTES.owner.productNew}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            Add Product
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input className="btc-input w-44" aria-label="Search" placeholder="Search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setPage(1);
            }}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === item.id
                ? 'bg-[var(--accent)] text-white'
                : 'border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)] hover:bg-[var(--bg-raised)]'
            }`}
          >
            {item.label}
            {item.id === 'all' ? '' : ` (${counts[item.id]})`}
          </button>
        ))}
        <input className="btc-input w-36" aria-label="Category" placeholder="Category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} />
        <input className="btc-input w-36" aria-label="Supplier" placeholder="Supplier id" value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setPage(1); }} />
        <select className="btc-input w-32" aria-label="Stock" value={stock} onChange={(event) => { setStock(event.target.value); setPage(1); }}>
          <option value="all">Any stock</option>
          <option value="in">In stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select className="btc-input w-32" aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="title">Name</option>
          <option value="retail">Retail</option>
          <option value="stock">Stock</option>
          <option value="created">Newest</option>
        </select>
        <select className="btc-input w-24" aria-label="Page size" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
          <option value={24}>24</option>
          <option value={48}>48</option>
          <option value={96}>96</option>
        </select>
        <button
          type="button"
          className="min-h-11 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text-2)]"
          onClick={() => setSalesSort((current) => (current === 'desc' ? 'asc' : 'desc'))}
        >
          Sort by sales {salesSort === 'asc' ? '↑' : '↓'}
        </button>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <button type="button" className="btc-btn-secondary" onClick={() => setSelected(new Set(rows.map((row) => row.id)))}>
          Select page
        </button>
        <button type="button" className="btc-btn-secondary" onClick={() => void selectAllFiltered()}>
          Select all filtered
        </button>
        <button type="button" className="btc-btn-secondary" onClick={() => setSelected(new Set())}>
          Clear
        </button>
        <button type="button" className="btc-btn-secondary" onClick={() => void runBulk('publish')}>Publish</button>
        <button type="button" className="btc-btn-secondary" onClick={() => void runBulk('pause')}>Pause</button>
        <button type="button" className="btc-btn-secondary" onClick={() => void runBulk('archive')}>Archive</button>
        <button type="button" className="btc-btn-secondary" onClick={() => void runBulk('delete')}>Delete</button>
        <input className="btc-input w-36" aria-label="Bulk category" placeholder="Category" value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)} />
        <button type="button" className="btc-btn-primary" onClick={() => void runBulk('set-category')}>Set category</button>
      </div>
      {error ? <PageError message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <SkeletonTable rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No products yet"
          description="Add your first product to start selling. Resellers can list your products in their bots."
          action={{ label: 'Add Product', href: ROUTES.owner.productNew }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(row) => row.id}
          emptyMessage="No products in this tab."
        />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="btc-btn-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {Math.max(1, Math.ceil(total / limit))} · {total} products
        </span>
        <button
          type="button"
          className="btc-btn-secondary"
          disabled={page >= Math.max(1, Math.ceil(total / limit))}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
