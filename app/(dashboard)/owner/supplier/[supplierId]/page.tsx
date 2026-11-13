/**
 * @file app/(dashboard)/owner/supplier/[supplierId]/page.tsx
 *
 * The full supplier catalog: one dense row per product, real paging, and markup rules.
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import { formatUsdt, usdtToMinor } from '@/lib/money';
import { priceWithRule, type MarkupKind, type MarkupSide } from '@/modules/supplier/markup-rules';

type Item = {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string | null;
  readonly supplierPrice: string;
  readonly supplierPublicPrice: string | null;
  readonly stockCount: number | null;
  readonly soldCount: number;
  readonly deliveryType: string;
  readonly durationText: string | null;
  readonly warrantyText: string | null;
  readonly typeLabel: string | null;
  readonly lastSyncedAt: string | null;
  readonly reviewStatus: string;
  readonly wholesalePriceMinor: string | null;
  readonly retailPriceMinor: string | null;
  readonly productId: string | null;
  readonly inStock: boolean;
};

type Counts = {
  readonly pending_review: number;
  readonly published: number;
  readonly rejected: number;
  readonly paused: number;
};

const STATUSES = [
  ['all', 'All'],
  ['pending_review', 'Pending'],
  ['published', 'Published'],
  ['rejected', 'Rejected'],
  ['paused', 'Paused'],
] as const;

function moneyOrBlank(minor: string | null): string {
  if (!minor) {
    return '';
  }
  try {
    return formatUsdt(BigInt(minor)).replace(' USDT', '');
  } catch {
    return '';
  }
}

function ruleFrom(kind: MarkupKind, value: string): MarkupSide | null {
  if (!value.trim()) {
    return null;
  }
  if (kind === 'fixed') {
    try {
      return { kind, percent: null, minor: usdtToMinor(value) };
    } catch {
      return null;
    }
  }
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 999.99) {
    return null;
  }
  return { kind, percent, minor: null };
}

export default function SupplierCatalogPage({ params }: { readonly params: { supplierId: string } }): JSX.Element {
  const [status, setStatus] = useState<(typeof STATUSES)[number][0]>('pending_review');
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [stock, setStock] = useState<'all' | 'in' | 'out'>('all');
  const [pushed, setPushed] = useState<'all' | 'published' | 'not_published'>('all');
  const [sort, setSort] = useState<'name' | 'cost' | 'stock' | 'synced'>('name');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<24 | 48 | 96>(24);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts>({ pending_review: 0, published: 0, rejected: 0, paused: 0 });
  const [prices, setPrices] = useState<Record<string, { wholesale: string; retail: string }>>({});
  const [loading, setLoading] = useState(true);
  const [syncNote, setSyncNote] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [wholesaleKind, setWholesaleKind] = useState<MarkupKind>('percent');
  const [wholesaleValue, setWholesaleValue] = useState('50');
  const [retailKind, setRetailKind] = useState<MarkupKind>('fixed');
  const [retailValue, setRetailValue] = useState('2');
  const [buyerCategory, setBuyerCategory] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        supplierId: params.supplierId,
        status,
        search,
        stock,
        pushed,
        sort,
        page: String(page),
        limit: String(limit),
      });
      const response = await fetch(`${API_ROUTES.supplierCatalog}?${query.toString()}`);
      const json = (await response.json()) as {
        success: boolean;
        data?: { products: Item[]; total: number; counts: Counts };
      };
      if (json.success && json.data) {
        setItems(json.data.products);
        setTotal(json.data.total);
        setCounts(json.data.counts);
        setSelected(new Set());
        setPrices((current) => {
          const next = { ...current };
          for (const item of json.data?.products ?? []) {
            if (!next[item.id]) {
              next[item.id] = {
                wholesale: moneyOrBlank(item.wholesalePriceMinor),
                retail: moneyOrBlank(item.retailPriceMinor),
              };
            }
          }
          return next;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [limit, page, params.supplierId, pushed, search, sort, status, stock]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / limit));
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const previewSource = items.find((item) => selected.has(item.id)) ?? items[0];
  const wholesaleRule = ruleFrom(wholesaleKind, wholesaleValue);
  const retailRule = ruleFrom(retailKind, retailValue);
  let preview = '';
  if (previewSource && wholesaleRule && retailRule) {
    try {
      const cost = usdtToMinor(previewSource.supplierPrice);
      preview = `${formatUsdt(priceWithRule(cost, wholesaleRule))} / ${formatUsdt(priceWithRule(cost, retailRule))}`;
    } catch {
      preview = '';
    }
  }

  function toggleOne(id: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function publish(item: Item): Promise<void> {
    const entry = prices[item.id] ?? { wholesale: '', retail: '' };
    const response = await fetch(API_ROUTES.supplierPublish(item.id), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wholesalePriceUsdt: entry.wholesale, retailPriceUsdt: entry.retail }),
    });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      toast.error(json.error?.message ?? 'Unable to publish');
      return;
    }
    toast.success('Published to catalog');
    await load();
  }

  async function review(item: Item, action: 'reject' | 'restore' | 'pause'): Promise<void> {
    const url =
      action === 'reject'
        ? API_ROUTES.supplierReject(item.id)
        : action === 'pause'
          ? API_ROUTES.supplierPause(item.id)
          : API_ROUTES.supplierRestore(item.id);
    const response = await fetch(url, { method: 'POST' });
    const json = (await response.json()) as { success: boolean };
    if (!json.success) {
      toast.error('Unable to update product');
      return;
    }
    await load();
  }

  async function sync(): Promise<void> {
    const response = await fetch(API_ROUTES.supplierSync, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId: params.supplierId }),
    });
    const json = (await response.json()) as {
      success: boolean;
      data?: { results: Array<{ ok: boolean; stockChanged?: number; repriced?: number; autoPaused?: number }> };
    };
    const summary = json.data?.results?.[0];
    if (!json.success || !summary?.ok) {
      toast.error('Sync failed');
      return;
    }
    const note = `Stock changes ${summary.stockChanged ?? 0}. Repriced ${summary.repriced ?? 0}. Auto-paused ${summary.autoPaused ?? 0}.`;
    setSyncNote(note);
    toast.success(note);
    await load();
  }

  async function publishSelected(): Promise<void> {
    const ids = items.filter((item) => selected.has(item.id)).map((item) => item.id);
    if (ids.length === 0 || !wholesaleRule || !retailRule) {
      toast.error('Select products and enter both markup rules');
      return;
    }
    const response = await fetch(API_ROUTES.supplierBulkPublish, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierProductIds: ids,
        wholesaleMarkupKind: wholesaleKind,
        wholesaleMarkupValue: Number(wholesaleValue),
        retailMarkupKind: retailKind,
        retailMarkupValue: Number(retailValue),
        ...(buyerCategory.trim() ? { buyerCategory: buyerCategory.trim() } : {}),
      }),
    });
    const json = (await response.json()) as {
      success: boolean;
      error?: { message: string };
      data?: { results: Array<{ ok: boolean }> };
    };
    if (!json.success || !json.data) {
      toast.error(json.error?.message ?? 'Unable to publish');
      return;
    }
    const failed = json.data.results.filter((result) => !result.ok).length;
    if (failed === 0) {
      toast.success(`Published ${json.data.results.length}`);
    } else {
      toast.error(`${failed} of ${json.data.results.length} could not be published`);
    }
    await load();
  }

  return (
    <>
      <PageHeader title="Supplier catalog" description="Every imported product, with the supplier's own fields." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={ROUTES.owner.supplier} className="text-sm text-[var(--accent)]">
          All suppliers
        </Link>
        <button type="button" className="btc-btn-secondary" onClick={() => void sync()}>
          Sync now
        </button>
        {syncNote ? <p className="text-sm text-[var(--text-2)]">{syncNote}</p> : null}
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <input
          className="btc-input w-48"
          value={search}
          placeholder="Search name or SKU"
          aria-label="Search"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {STATUSES.map(([id, label]) => {
          const count = id === 'all' ? null : counts[id];
          return (
            <button
              key={id}
              type="button"
              className={status === id ? 'btc-btn-primary' : 'btc-btn-secondary'}
              onClick={() => {
                setStatus(id);
                setPage(1);
              }}
            >
              {label}
              {count === null ? '' : ` (${count})`}
            </button>
          );
        })}
        <select
          className="btc-input w-36"
          aria-label="Stock"
          value={stock}
          onChange={(event) => {
            setStock(event.target.value as 'all' | 'in' | 'out');
            setPage(1);
          }}
        >
          <option value="all">Any stock</option>
          <option value="in">In stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select
          className="btc-input w-40"
          aria-label="Pushed"
          value={pushed}
          onChange={(event) => {
            setPushed(event.target.value as 'all' | 'published' | 'not_published');
            setPage(1);
          }}
        >
          <option value="all">Any catalog state</option>
          <option value="published">Published</option>
          <option value="not_published">Not published</option>
        </select>
        <select
          className="btc-input w-36"
          aria-label="Sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as 'name' | 'cost' | 'stock' | 'synced')}
        >
          <option value="name">Name</option>
          <option value="cost">Cost</option>
          <option value="stock">Stock</option>
          <option value="synced">Last synced</option>
        </select>
        <select
          className="btc-input w-28"
          aria-label="Page size"
          value={limit}
          onChange={(event) => {
            setLimit(Number(event.target.value) as 24 | 48 | 96);
            setPage(1);
          }}
        >
          <option value={24}>24</option>
          <option value={48}>48</option>
          <option value={96}>96</option>
        </select>
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))}
          />
          Select page
        </label>
        <label className="text-sm">
          Wholesale
          <span className="mt-1 flex gap-1">
            <select className="btc-input" aria-label="Wholesale markup kind" value={wholesaleKind} onChange={(event) => setWholesaleKind(event.target.value as MarkupKind)}>
              <option value="percent">Percent</option>
              <option value="fixed">Fixed USDT</option>
            </select>
            <input className="btc-input w-24" aria-label="Wholesale markup" value={wholesaleValue} onChange={(event) => setWholesaleValue(event.target.value)} />
          </span>
        </label>
        <label className="text-sm">
          Retail
          <span className="mt-1 flex gap-1">
            <select className="btc-input" aria-label="Retail markup kind" value={retailKind} onChange={(event) => setRetailKind(event.target.value as MarkupKind)}>
              <option value="percent">Percent</option>
              <option value="fixed">Fixed USDT</option>
            </select>
            <input className="btc-input w-24" aria-label="Retail markup" value={retailValue} onChange={(event) => setRetailValue(event.target.value)} />
          </span>
        </label>
        <label className="text-sm">
          Buyer category
          <input className="btc-input mt-1 w-40" value={buyerCategory} placeholder="Optional" onChange={(event) => setBuyerCategory(event.target.value)} />
        </label>
        <button type="button" className="btc-btn-primary" onClick={() => void publishSelected()}>
          Publish selected{preview ? ` · ${preview}` : ''}
        </button>
      </div>
      <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--bg-raised)] text-[var(--text-2)]">
            <tr>
              <th className="p-2">Select</th>
              <th className="p-2">Product</th>
              <th className="p-2">Cost</th>
              <th className="p-2">Public</th>
              <th className="p-2">Stock</th>
              <th className="p-2">Sold</th>
              <th className="p-2">Delivery</th>
              <th className="p-2">Duration</th>
              <th className="p-2">Warranty</th>
              <th className="p-2">Type</th>
              <th className="p-2">Synced</th>
              <th className="p-2">Catalog</th>
              <th className="p-2">Publish</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 text-[var(--text-2)]" colSpan={13}>
                  Loading
                </td>
              </tr>
            ) : null}
            {items.map((item) => {
              const entry = prices[item.id] ?? { wholesale: '', retail: '' };
              return (
                <tr key={item.id} className="border-t border-[var(--border)]">
                  <td className="p-2">
                    <input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.has(item.id)} onChange={() => toggleOne(item.id)} />
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      {item.imageUrl ? (
                        // Supplier image hosts are not in the Next image allowlist.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="h-8 w-8 rounded border border-[var(--border)] object-cover" />
                      ) : null}
                      <span className="font-medium text-[var(--text-1)]">{item.name}</span>
                    </div>
                  </td>
                  <td className="p-2">{item.supplierPrice}</td>
                  <td className="p-2">{item.supplierPublicPrice ?? '—'}</td>
                  <td className="p-2">
                    {item.inStock ? 'In stock' : 'Out of stock'}
                    <span className="block text-[var(--text-3)]">{item.stockCount === null ? 'Unlimited' : item.stockCount}</span>
                  </td>
                  <td className="p-2">{item.soldCount}</td>
                  <td className="p-2">{item.deliveryType}</td>
                  <td className="p-2">{item.durationText ?? '—'}</td>
                  <td className="p-2">{item.warrantyText ?? '—'}</td>
                  <td className="p-2">{item.typeLabel ?? '—'}</td>
                  <td className="p-2">{item.lastSyncedAt ? new Date(item.lastSyncedAt).toLocaleString() : '—'}</td>
                  <td className="p-2">
                    {item.productId ? (
                      <Link href={ROUTES.owner.productDetail(item.productId)} className="text-[var(--accent)]">
                        Published
                      </Link>
                    ) : (
                      <span className="text-[var(--text-3)]">Not published</span>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <input
                        className="btc-input w-20"
                        aria-label={`Wholesale for ${item.name}`}
                        value={entry.wholesale}
                        placeholder="Wholesale"
                        onChange={(event) => setPrices({ ...prices, [item.id]: { ...entry, wholesale: event.target.value } })}
                      />
                      <input
                        className="btc-input w-20"
                        aria-label={`Retail for ${item.name}`}
                        value={entry.retail}
                        placeholder="Retail"
                        onChange={(event) => setPrices({ ...prices, [item.id]: { ...entry, retail: event.target.value } })}
                      />
                      <button type="button" className="btc-btn-primary" onClick={() => void publish(item)}>
                        Publish
                      </button>
                      {item.reviewStatus === 'rejected' ? (
                        <button type="button" className="btc-btn-secondary" onClick={() => void review(item, 'restore')}>
                          Restore
                        </button>
                      ) : (
                        <button type="button" className="btc-btn-secondary" onClick={() => void review(item, 'reject')}>
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="btc-btn-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {pageCount} · {total} products
        </span>
        <button type="button" className="btc-btn-secondary" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>
          Next
        </button>
      </div>
    </>
  );
}
