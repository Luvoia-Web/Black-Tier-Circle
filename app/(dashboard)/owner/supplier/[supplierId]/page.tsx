/**
 * @file app/(dashboard)/owner/supplier/[supplierId]/page.tsx
 *
 * Review imported products, set prices, and publish them to the catalog.
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import { formatUsdt, usdtToMinor } from '@/lib/money';

type Item = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly supplierPrice: string;
  readonly deliveryType: string;
  readonly reviewStatus: string;
  readonly wholesalePriceMinor: string | null;
  readonly retailPriceMinor: string | null;
  readonly productId: string | null;
  readonly inStock: boolean;
};

const TABS = [
  ['pending_review', 'Pending Review'],
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

export default function SupplierCatalogPage({ params }: { readonly params: { supplierId: string } }): JSX.Element {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('pending_review');
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [prices, setPrices] = useState<Record<string, { wholesale: string; retail: string }>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ supplierId: params.supplierId, status: tab, search });
      const response = await fetch(`${API_ROUTES.supplierCatalog}?${query.toString()}`);
      const json = (await response.json()) as { success: boolean; data?: { products: Item[] } };
      if (json.success && json.data) {
        setItems(json.data.products);
        setPrices((current) => {
          const next = { ...current };
          for (const item of json.data?.products ?? []) {
            if (!next[item.id]) {
              next[item.id] = { wholesale: moneyOrBlank(item.wholesalePriceMinor), retail: moneyOrBlank(item.retailPriceMinor) };
            }
          }
          return next;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [params.supplierId, search, tab]);

  useEffect(() => {
    void load();
  }, [load]);

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
    toast.success(action === 'reject' ? 'Rejected' : action === 'pause' ? 'Paused' : 'Restored to review');
    await load();
  }

  async function sync(): Promise<void> {
    const response = await fetch(API_ROUTES.supplierSync, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId: params.supplierId }),
    });
    const json = (await response.json()) as { success: boolean };
    if (!json.success) {
      toast.error('Sync failed');
      return;
    }
    toast.success('Sync finished');
    await load();
  }

  const counts = useMemo(() => items.length, [items.length]);

  return (
    <>
      <PageHeader
        title="Supplier Products"
        description="Set wholesale and retail prices, then publish into the catalog."
        actions={
          <button type="button" className="btc-btn-secondary" onClick={() => void sync()}>
            Sync Now
          </button>
        }
      />
      <Link href={ROUTES.owner.supplier} className="mb-4 inline-flex text-sm text-[var(--accent)] hover:underline">
        ← Back to Suppliers
      </Link>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'btc-btn-primary' : 'btc-btn-secondary'}
            onClick={() => setTab(id)}
          >
            {label}
            {tab === id ? ` (${counts})` : ''}
          </button>
        ))}
      </div>
      <input
        className="btc-input mb-4 max-w-md"
        placeholder="Search products"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {loading ? <p className="text-sm text-[var(--text-2)]">Loading products…</p> : null}
      {tab === 'pending_review' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => {
            const entry = prices[item.id] ?? { wholesale: '', retail: '' };
            let note = '';
            try {
              const cost = usdtToMinor(item.supplierPrice);
              const wholesale = entry.wholesale ? usdtToMinor(entry.wholesale) : null;
              const retail = entry.retail ? usdtToMinor(entry.retail) : null;
              if (wholesale !== null && wholesale <= cost) {
                note = `Must be above supplier cost (${item.supplierPrice} USDT)`;
              } else if (wholesale !== null && retail !== null && retail < wholesale) {
                note = 'Retail must be at least the wholesale price';
              } else if (wholesale !== null && cost > 0n) {
                const margin = wholesale - cost;
                const percent = Number((margin * 10000n) / cost) / 100;
                note = `Margin ${formatUsdt(margin)} (${percent.toFixed(1)}%)`;
              }
            } catch {
              note = 'Enter a valid USDT amount';
            }
            return (
              <article key={item.id} className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4">
                {item.imageUrl ? <p className="mb-2 text-xs text-[var(--text-3)]">Image on file</p> : null}
                <h2 className="font-medium">{item.name}</h2>
                <p className="text-sm text-[var(--text-2)]">{item.deliveryType} · {item.inStock ? 'In stock' : 'Out of stock'}</p>
                <p className="mt-2 text-sm">Supplier cost: {item.supplierPrice} USDT</p>
                <label className="mt-3 block text-sm">
                  Your wholesale
                  <input
                    className="btc-input mt-1"
                    value={entry.wholesale}
                    onChange={(event) =>
                      setPrices({ ...prices, [item.id]: { ...entry, wholesale: event.target.value } })
                    }
                  />
                </label>
                <label className="mt-3 block text-sm">
                  Your retail
                  <input
                    className="btc-input mt-1"
                    value={entry.retail}
                    onChange={(event) => setPrices({ ...prices, [item.id]: { ...entry, retail: event.target.value } })}
                  />
                </label>
                <p className="mt-2 text-sm text-[var(--text-2)]">{note}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btc-btn-primary" onClick={() => void publish(item)}>
                    Publish to Catalog
                  </button>
                  <button type="button" className="btc-btn-secondary" onClick={() => void review(item, 'reject')}>
                    Reject
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--bg-raised)]">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">Supplier cost</th>
                <th className="p-3">Wholesale</th>
                <th className="p-3">Retail</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-[var(--border)]">
                  <td className="p-3">{item.name}</td>
                  <td className="p-3">{item.supplierPrice}</td>
                  <td className="p-3">{moneyOrBlank(item.wholesalePriceMinor) || '—'}</td>
                  <td className="p-3">{moneyOrBlank(item.retailPriceMinor) || '—'}</td>
                  <td className="p-3">
                    {tab === 'rejected' ? (
                      <button type="button" className="text-[var(--accent)]" onClick={() => void review(item, 'restore')}>
                        Restore to Review
                      </button>
                    ) : (
                      <button type="button" className="text-[var(--accent)]" onClick={() => void review(item, 'pause')}>
                        Pause
                      </button>
                    )}
                    {item.productId ? (
                      <Link href={ROUTES.owner.productDetail(item.productId)} className="ml-3 text-[var(--accent)]">
                        View in Catalog
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
