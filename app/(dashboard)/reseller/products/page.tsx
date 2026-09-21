/**
 * @file app/(dashboard)/reseller/products/page.tsx
 *
 * Reseller catalog: available products and own listings with a pricing modal.
 *
 * @module Dashboard
 */

'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { formatUsdt, usdtToMinor } from '@/lib/money';
import { API_ROUTES } from '@/lib/navigation';
import { getMarginMinor, getMarginPercent } from '@/modules/pricing';

type ProductDto = {
  readonly id: string;
  readonly title: string;
  readonly category: string | null;
  readonly deliveryType: string;
  readonly wholesalePriceMinor: string;
  readonly retailPriceMinor: string;
};

type ListingDto = {
  readonly id: string;
  readonly productId: string;
  readonly retailPriceMinor: string;
  readonly isVisible: boolean;
  readonly product: ProductDto;
};

type Tab = 'available' | 'listings';

const inputClass =
  'rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';

function usdtFromMinor(minor: string): string {
  const full = formatUsdt(BigInt(minor)).replace(' USDT', '');
  return full;
}

/**
 * Reseller products page with available-to-list and my-listings tabs.
 */
export default function ResellerProductsPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('available');
  const [available, setAvailable] = useState<ProductDto[]>([]);
  const [listings, setListings] = useState<ListingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<ProductDto | null>(null);
  const [modalListingId, setModalListingId] = useState<string | null>(null);
  const [retailUsdt, setRetailUsdt] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.resellerListings);
      const json = (await response.json()) as {
        success: boolean;
        data?: { listings: ListingDto[]; available: ProductDto[] };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load products');
        return;
      }
      setListings(json.data.listings);
      setAvailable(json.data.available);
    } catch {
      setError('Unable to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const listedIds = useMemo(() => new Set(listings.map((item) => item.productId)), [listings]);
  const unlisted = available.filter((product) => !listedIds.has(product.id));

  const marginCopy = useMemo(() => {
    if (!modalProduct) {
      return null;
    }
    try {
      const wholesale = BigInt(modalProduct.wholesalePriceMinor);
      const retail = usdtToMinor(retailUsdt || '0');
      if (retail < wholesale) {
        return { text: 'Retail price must be at least wholesale.', warning: true };
      }
      const minor = getMarginMinor(wholesale, retail);
      const percent = getMarginPercent(wholesale, retail);
      const warning = percent < 10;
      return {
        text: `You earn ${formatUsdt(minor)} (${percent.toFixed(2)}%) per sale`,
        warning,
      };
    } catch {
      return null;
    }
  }, [modalProduct, retailUsdt]);

  function openCreate(product: ProductDto): void {
    setModalProduct(product);
    setModalListingId(null);
    setRetailUsdt(usdtFromMinor(product.retailPriceMinor));
  }

  function openEdit(listing: ListingDto): void {
    setModalProduct(listing.product);
    setModalListingId(listing.id);
    setRetailUsdt(usdtFromMinor(listing.retailPriceMinor));
  }

  async function submitPrice(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!modalProduct) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const retailPriceMinor = usdtToMinor(retailUsdt);
      const wholesale = BigInt(modalProduct.wholesalePriceMinor);
      if (retailPriceMinor < wholesale) {
        setError(`Retail price must be at least ${formatUsdt(wholesale)} (wholesale price)`);
        return;
      }
      if (modalListingId) {
        const response = await fetch(API_ROUTES.resellerListing(modalListingId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retailPriceStr: retailPriceMinor.toString() }),
        });
        const json = (await response.json()) as { success: boolean; error?: { message: string } };
        if (!json.success) {
          setError(json.error?.message ?? 'Unable to update listing');
          return;
        }
      } else {
        const response = await fetch(API_ROUTES.productListings(modalProduct.id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retailPriceMinor: retailPriceMinor.toString() }),
        });
        const json = (await response.json()) as { success: boolean; error?: { message: string } };
        if (!json.success) {
          setError(json.error?.message ?? 'Unable to create listing');
          return;
        }
      }
      setModalProduct(null);
      setModalListingId(null);
      await load();
    } catch {
      setError('Unable to save listing');
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisible(listing: ListingDto): Promise<void> {
    const response = await fetch(API_ROUTES.resellerListing(listing.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isVisible: !listing.isVisible }),
    });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      setError(json.error?.message ?? 'Unable to update visibility');
      return;
    }
    await load();
  }

  async function hideListing(listing: ListingDto): Promise<void> {
    const response = await fetch(API_ROUTES.resellerListing(listing.id), {
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

  const availableColumns: ReadonlyArray<DataTableColumn<ProductDto>> = [
    { key: 'title', header: 'Title', render: (row) => row.title },
    { key: 'category', header: 'Category', render: (row) => row.category ?? '—' },
    {
      key: 'wholesale',
      header: 'Wholesale Price',
      render: (row) => formatUsdt(BigInt(row.wholesalePriceMinor)),
    },
    {
      key: 'retail',
      header: 'Default Retail Price',
      render: (row) => formatUsdt(BigInt(row.retailPriceMinor)),
    },
    { key: 'delivery', header: 'Delivery Type', render: (row) => row.deliveryType.replace('_', ' ') },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <button
          type="button"
          onClick={() => openCreate(row)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          Add to My Store
        </button>
      ),
    },
  ];

  const listingColumns: ReadonlyArray<DataTableColumn<ListingDto>> = [
    { key: 'title', header: 'Title', render: (row) => row.product.title },
    {
      key: 'price',
      header: 'My Price',
      render: (row) => formatUsdt(BigInt(row.retailPriceMinor)),
    },
    {
      key: 'wholesale',
      header: 'Wholesale Price',
      render: (row) => formatUsdt(BigInt(row.product.wholesalePriceMinor)),
    },
    {
      key: 'margin',
      header: 'Margin',
      render: (row) => {
        const wholesale = BigInt(row.product.wholesalePriceMinor);
        const retail = BigInt(row.retailPriceMinor);
        return `${formatUsdt(getMarginMinor(wholesale, retail))} (${getMarginPercent(wholesale, retail).toFixed(2)}%)`;
      },
    },
    {
      key: 'visible',
      header: 'Visible',
      render: (row) => (
        <button
          type="button"
          onClick={() => void toggleVisible(row)}
          className="text-xs font-medium text-indigo-400"
        >
          {row.isVisible ? 'Visible' : 'Hidden'}
        </button>
      ),
    },
    {
      key: 'edit',
      header: 'Edit price',
      render: (row) => (
        <button type="button" onClick={() => openEdit(row)} className="text-xs font-medium text-indigo-400">
          Edit price
        </button>
      ),
    },
    {
      key: 'remove',
      header: 'Remove',
      render: (row) => (
        <button type="button" onClick={() => void hideListing(row)} className="text-xs font-medium text-red-400">
          Remove
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        description="Browse the owner catalog and set your retail prices"
      />
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('available')}
          className={`rounded-md px-3 py-1.5 text-sm ${
            tab === 'available' ? 'bg-indigo-600 text-white' : 'border border-gray-800 bg-gray-900 text-gray-300'
          }`}
        >
          Available to List
        </button>
        <button
          type="button"
          onClick={() => setTab('listings')}
          className={`rounded-md px-3 py-1.5 text-sm ${
            tab === 'listings' ? 'bg-indigo-600 text-white' : 'border border-gray-800 bg-gray-900 text-gray-300'
          }`}
        >
          My Listings
        </button>
      </div>
      {error ? (
        <p className="mb-4 rounded-md border border-red-600/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-400">Loading products…</p>
      ) : tab === 'available' ? (
        <DataTable
          columns={availableColumns}
          rows={unlisted}
          rowKey={(row) => row.id}
          emptyMessage="No products available to list."
        />
      ) : (
        <DataTable
          columns={listingColumns}
          rows={listings}
          rowKey={(row) => row.id}
          emptyMessage="You have not listed any products yet."
        />
      )}

      {modalProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-800 bg-gray-950 p-6">
            <h2 className="text-lg font-semibold text-gray-100">{modalProduct.title}</h2>
            <p className="mt-1 text-sm text-gray-400">
              Wholesale price {formatUsdt(BigInt(modalProduct.wholesalePriceMinor))}
            </p>
            <form onSubmit={(event) => void submitPrice(event)} className="mt-4 space-y-4">
              <label className="flex flex-col gap-1 text-sm text-gray-400">
                Your retail price
                <input
                  required
                  inputMode="decimal"
                  value={retailUsdt}
                  onChange={(event) => setRetailUsdt(event.target.value)}
                  className={inputClass}
                />
                <span className="text-xs text-gray-500">Enter in USDT (e.g. 10.50)</span>
              </label>
              {marginCopy ? (
                <p className={`text-sm ${marginCopy.warning ? 'text-yellow-400' : 'text-emerald-400'}`}>
                  {marginCopy.text}
                  {marginCopy.warning && marginCopy.text.startsWith('You earn')
                    ? ' Low margin — consider pricing higher'
                    : null}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalProduct(null)}
                  className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
