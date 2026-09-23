/**
 * @file app/(dashboard)/reseller/products/page.tsx
 *
 * Reseller store catalog. Published owner products appear here without a manual sync.
 *
 * @module Dashboard
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorState } from '@/components/ui/fetch-states';
import { PageHeader } from '@/components/ui/page-header';
import { formatUsdt, usdtToMinor } from '@/lib/money';
import { API_ROUTES } from '@/lib/navigation';
import { getMarginMinor, getMarginPercent } from '@/modules/pricing';

type CatalogListing = {
  readonly id: string;
  readonly retailPriceMinor: string;
  readonly isVisible: boolean;
};

type CatalogRow = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly deliveryType: string;
  readonly wholesalePriceMinor: string;
  readonly retailPriceMinor: string;
  readonly stockUnlimited: boolean;
  readonly stockCount: number | null;
  readonly estimatedDeliveryMinutes: number | null;
  readonly listing: CatalogListing | null;
  readonly isListed: boolean;
};

type Tab = 'available' | 'store';

function usdtFromMinor(minor: string): string {
  return formatUsdt(BigInt(minor)).replace(' USDT', '');
}

function deliveryLabel(value: string): string {
  if (value === 'file_reusable') {
    return 'file';
  }
  if (value === 'inventory_unit') {
    return 'key';
  }
  if (value === 'supplier_api') {
    return 'supplier';
  }
  return 'manual';
}

function stockLabel(row: CatalogRow): string {
  if (row.stockUnlimited) {
    return 'unlimited';
  }
  return `${row.stockCount ?? 0} left`;
}

function marginFor(wholesaleMinor: string, retailUsdt: string): { text: string; tone: 'ok' | 'low' | 'error' } | null {
  try {
    const wholesale = BigInt(wholesaleMinor);
    const retail = usdtToMinor(retailUsdt || '0');
    if (retail < wholesale) {
      return { text: 'Must be above cost price', tone: 'error' };
    }
    const profit = getMarginMinor(wholesale, retail);
    const percent = getMarginPercent(wholesale, retail);
    return {
      text: `You earn ${formatUsdt(profit)} (${percent.toFixed(0)}%)`,
      tone: percent < 10 ? 'low' : 'ok',
    };
  } catch {
    return null;
  }
}

/**
 * Reseller products: list the owner catalog and manage this store's prices.
 */
export default function ResellerProductsPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('available');
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [markup, setMarkup] = useState('0');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.resellerCatalog);
      const json = (await response.json()) as {
        success: boolean;
        data?: CatalogRow[];
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load products');
        return;
      }
      setRows(json.data);
      setDrafts((current) => {
        const next = { ...current };
        for (const row of json.data ?? []) {
          if (next[row.id] === undefined) {
            next[row.id] = usdtFromMinor(row.listing?.retailPriceMinor ?? row.retailPriceMinor);
          }
        }
        return next;
      });
      const settingsRes = await fetch(API_ROUTES.resellerSettings);
      const settingsJson = (await settingsRes.json()) as {
        success: boolean;
        data?: { settings: { markupPercent: number } };
      };
      if (settingsJson.success && settingsJson.data) {
        setMarkup(String(settingsJson.data.settings.markupPercent));
      }
    } catch {
      setError('Unable to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const listedCount = rows.filter((row) => row.isListed).length;
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle.length === 0 ? rows : rows.filter((row) => row.title.toLowerCase().includes(needle));
    if (tab === 'store') {
      return filtered.filter((row) => row.isListed);
    }
    return filtered;
  }, [query, rows, tab]);

  async function savePrice(row: CatalogRow): Promise<void> {
    const draft = drafts[row.id] ?? '';
    const margin = marginFor(row.wholesalePriceMinor, draft);
    if (margin?.tone === 'error' || margin === null) {
      setError(margin?.text ?? 'Enter a price above the cost');
      return;
    }
    setSavingId(row.id);
    setError(null);
    try {
      const retailPriceMinor = usdtToMinor(draft).toString();
      const response = row.listing
        ? await fetch(API_ROUTES.resellerListing(row.listing.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ retailPriceStr: retailPriceMinor }),
          })
        : await fetch(API_ROUTES.resellerCatalog, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: row.id, retailPriceMinor }),
          });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to save price');
        return;
      }
      await load();
    } catch {
      setError('Unable to save price');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleVisible(row: CatalogRow): Promise<void> {
    if (!row.listing) {
      return;
    }
    const response = await fetch(API_ROUTES.resellerListing(row.listing.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isVisible: !row.listing.isVisible }),
    });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      setError(json.error?.message ?? 'Unable to update visibility');
      return;
    }
    await load();
  }

  async function removeListing(row: CatalogRow): Promise<void> {
    if (!row.listing) {
      return;
    }
    const response = await fetch(API_ROUTES.resellerListing(row.listing.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isVisible: false }),
    });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      setError(json.error?.message ?? 'Unable to remove listing');
      return;
    }
    await load();
  }

  async function applyMarkup(): Promise<void> {
    const percent = Number(markup);
    if (!Number.isFinite(percent) || percent < 0) {
      setError('Enter a markup percent of 0 or more');
      return;
    }
    const response = await fetch(API_ROUTES.resellerMarkup, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markupPercent: percent }),
    });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      setError(json.error?.message ?? 'Unable to apply markup');
      return;
    }
    const hundredths = BigInt(Math.round(percent * 100));
    const unlisted = rows.filter((row) => !row.isListed);
    for (const row of unlisted) {
      const retail = (BigInt(row.wholesalePriceMinor) * (10000n + hundredths)) / 10000n;
      const created = await fetch(API_ROUTES.resellerCatalog, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: row.id, retailPriceMinor: retail.toString() }),
      });
      const createdJson = (await created.json()) as { success: boolean; error?: { message: string } };
      if (!createdJson.success) {
        setError(createdJson.error?.message ?? 'Unable to list every product');
        return;
      }
    }
    setDrafts({});
    await load();
  }

  return (
    <>
      <PageHeader
        title="Products"
        description="Owner products appear here as soon as they are published. Set your price and they show in your bot."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('available')}
          className={`rounded-md px-3 py-1.5 text-sm ${
            tab === 'available'
              ? 'bg-[var(--accent)] text-white'
              : 'border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)]'
          }`}
        >
          Available to List ({rows.length - listedCount})
        </button>
        <button
          type="button"
          onClick={() => setTab('store')}
          className={`rounded-md px-3 py-1.5 text-sm ${
            tab === 'store'
              ? 'bg-[var(--accent)] text-white'
              : 'border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)]'
          }`}
        >
          My Store ({listedCount})
        </button>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products"
          className="btc-input max-w-sm"
          aria-label="Search products"
        />
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <p className="text-sm font-medium text-[var(--text-1)]">Apply markup to all products</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">This will set selling price = cost × (1 + markup%)</p>
          <div className="mt-2 flex gap-2">
            <input
              value={markup}
              onChange={(event) => setMarkup(event.target.value)}
              className="btc-input w-24"
              aria-label="Markup percent"
              inputMode="decimal"
            />
            <button
              type="button"
              onClick={() => void applyMarkup()}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
            >
              Apply to All Products
            </button>
          </div>
        </div>
      </div>
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <p className="text-sm text-[var(--text-3)]">Loading catalog…</p>
      ) : visibleRows.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">
          {tab === 'store' ? 'Nothing in your store yet. Add a product from Available to List.' : 'No products match.'}
        </p>
      ) : (
        <div className="grid gap-3">
          {visibleRows.map((row) => {
            const draft = drafts[row.id] ?? '';
            const margin = marginFor(row.wholesalePriceMinor, draft);
            const toneClass =
              margin?.tone === 'error'
                ? 'text-[var(--red)]'
                : margin?.tone === 'low'
                  ? 'text-[var(--amber)]'
                  : 'text-[var(--green)]';
            return (
              <article key={row.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--text-1)]">📦 {row.title}</h2>
                    <p className="mt-1 text-sm text-[var(--text-2)]">
                      Cost: {formatUsdt(BigInt(row.wholesalePriceMinor))} · Delivery: {deliveryLabel(row.deliveryType)} ·
                      Stock: {stockLabel(row)}
                      {row.category ? ` · ${row.category}` : ''}
                    </p>
                  </div>
                  {row.listing ? (
                    <button
                      type="button"
                      onClick={() => void toggleVisible(row)}
                      className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--text-1)]"
                    >
                      {row.listing.isVisible ? 'ON' : 'OFF'}
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs text-[var(--text-3)]">
                    Your price (USDT)
                    <input
                      value={draft}
                      onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                      className="btc-input w-36"
                      inputMode="decimal"
                      aria-label={`Price for ${row.title}`}
                    />
                  </label>
                  {margin ? (
                    <p className={`pb-2 text-sm ${toneClass}`}>
                      {margin.tone === 'error' ? '❌ ' : margin.tone === 'low' ? '⚠ Low margin · ' : '✅ '}
                      {margin.text}
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={savingId === row.id}
                    onClick={() => void savePrice(row)}
                    className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
                  >
                    {row.listing ? 'Save price' : 'Add to My Store'}
                  </button>
                  {row.listing ? (
                    <button
                      type="button"
                      onClick={() => void removeListing(row)}
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--red)]"
                    >
                      Remove from Store
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
