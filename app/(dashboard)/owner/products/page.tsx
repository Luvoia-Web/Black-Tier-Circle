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
import { formatUsdt } from '@/lib/money';
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

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const url =
        tab === 'all' ? API_ROUTES.products : `${API_ROUTES.products}?status=${encodeURIComponent(tab)}`;
      const response = await fetch(url);
      const json = (await response.json()) as {
        success: boolean;
        data?: ProductRow[];
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load products');
        setRows([]);
        return;
      }
      setRows(json.data);
    } catch {
      setError('Unable to load products');
    } finally {
      setLoading(false);
    }
  }, [tab]);

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

  const columns: ReadonlyArray<DataTableColumn<ProductRow>> = useMemo(
    () => [
      { key: 'sku', header: 'SKU', render: (row) => row.sku },
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
        render: (row) => formatUsdt(BigInt(row.wholesalePriceMinor)),
      },
      {
        key: 'retail',
        header: 'Retail',
        render: (row) => formatUsdt(BigInt(row.retailPriceMinor)),
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
    [pendingId, setStatus],
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === item.id
                ? 'bg-[var(--accent)] text-white'
                : 'border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)] hover:bg-[var(--bg-raised)]'
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="min-h-11 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text-2)]"
          onClick={() => setSalesSort((current) => (current === 'desc' ? 'asc' : 'desc'))}
        >
          Sort by sales {salesSort === 'asc' ? '↑' : '↓'}
        </button>
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
    </>
  );
}
