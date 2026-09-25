'use client';

/**
 * @file components/orders/owner-orders-board.tsx
 *
 * Owner order list with tabs, search, and manual fulfillment actions.
 *
 * @module Components
 */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { MarkFulfilledButton } from '@/components/orders/mark-fulfilled-button';
import { TrackBadge } from '@/components/orders/track-badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { OrderDetailModal } from '@/components/ui/OrderDetailModal';
import { PageError } from '@/components/ui/PageError';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { formatRelativeTime } from '@/lib/relative-time';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { OwnerOrderTab } from '@/modules/fulfillment';

type OrderRow = {
  readonly orderId: string;
  readonly channel: string;
  readonly source: string;
  readonly productTitle: string;
  readonly amount: string;
  readonly paymentStatus: string;
  readonly fundingStatus: string;
  readonly fulfillmentStatus: string;
  readonly deliveryStatus: string;
  readonly createdAt: string;
  readonly overdue: boolean;
};

const TABS: ReadonlyArray<{ id: OwnerOrderTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'awaiting_payment', label: 'Awaiting Payment' },
  { id: 'pending_fulfillment', label: 'Pending Fulfillment' },
  { id: 'manual_pending', label: 'Manual Action Required' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

type Stats = {
  readonly totalToday: number;
  readonly pendingPayment: number;
  readonly pendingFulfillment: number;
  readonly completedToday: number;
};

type OwnerOrdersBoardProps = {
  readonly stats: Stats;
};

/**
 * Owner orders table with tab filters.
 *
 * @param props - Quick stats from the server
 */
export function OwnerOrdersBoard({ stats }: OwnerOrdersBoardProps): JSX.Element {
  const [tab, setTab] = useState<OwnerOrderTab>('all');
  const searchParams = useSearchParams();
  const initialStore = searchParams.get('store');
  const [store, setStore] = useState<'all' | 'mine' | 'resellers'>(
    initialStore === 'mine' || initialStore === 'resellers' ? initialStore : 'all',
  );
  const [tenant, setTenant] = useState('all');
  const [supplier, setSupplier] = useState('all');
  const [facets, setFacets] = useState<{ tenants: Array<{ id: string; name: string }>; suppliers: string[] }>({
    tenants: [],
    suppliers: [],
  });
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ tab, limit: '50', q: query, store, tenant, supplier });
      const response = await fetch(`${API_ROUTES.ownerOrders}?${params.toString()}`);
      const json = (await response.json()) as {
        success: boolean;
        data?: {
          rows: OrderRow[];
          facets?: { tenants: Array<{ id: string; name: string }>; suppliers: string[] };
        };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load orders');
        setRows([]);
        return;
      }
      setRows(json.data.rows);
      if (json.data.facets) {
        setFacets(json.data.facets);
      }
    } catch {
      setError('Unable to load orders');
    } finally {
      setLoading(false);
    }
  }, [tab, query, store, tenant, supplier]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ReadonlyArray<DataTableColumn<OrderRow>> = [
    {
      key: 'ref',
      header: 'Order',
      render: (row) => (
        <Link href={ROUTES.owner.orderDetail(row.orderId)} className="text-[var(--accent-soft)] hover:text-[var(--accent)]">
          {row.orderId.slice(0, 8).toUpperCase()}
        </Link>
      ),
    },
    { key: 'product', header: 'Product', render: (row) => row.productTitle },
    {
      key: 'source',
      header: 'Source',
      render: (row) => (
        <span className={row.source === 'Own Product' ? 'text-[var(--green)]' : 'text-[var(--accent-soft)]'}>{row.source}</span>
      ),
    },
    { key: 'channel', header: 'Channel', render: (row) => row.channel },
    { key: 'amount', header: 'Amount', render: (row) => row.amount },
    { key: 'payment', header: 'Payment', render: (row) => <TrackBadge status={row.paymentStatus} /> },
    { key: 'fulfillment', header: 'Fulfillment', render: (row) => <TrackBadge status={row.fulfillmentStatus} /> },
    { key: 'delivery', header: 'Delivery', render: (row) => <TrackBadge status={row.deliveryStatus} /> },
    {
      key: 'age',
      header: 'Placed',
      render: (row) => (
        <span>
          {formatRelativeTime(row.createdAt)}
          {row.overdue ? <span className="ml-2 text-xs text-[var(--amber)]">Overdue</span> : null}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) =>
        row.fulfillmentStatus === 'manual_pending' ? <MarkFulfilledButton orderId={row.orderId} /> : null,
    },
    {
      key: 'view',
      header: '',
      render: (row) => (
        <button
          type="button"
          aria-label="View order"
          onClick={() => setSelectedOrderId(row.orderId)}
          className="text-[var(--text-3)] hover:text-[var(--text-1)]"
        >
          <Eye size={16} />
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Orders" description="Full order operations across channels" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <p className="text-xs text-[var(--text-2)]">Total today</p>
          <p className="text-xl font-semibold">{stats.totalToday}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <p className="text-xs text-[var(--text-2)]">Pending payment</p>
          <p className="text-xl font-semibold">{stats.pendingPayment}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <p className="text-xs text-[var(--text-2)]">Pending fulfillment</p>
          <p className="text-xl font-semibold">{stats.pendingFulfillment}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <p className="text-xs text-[var(--text-2)]">Completed today</p>
          <p className="text-xl font-semibold">{stats.completedToday}</p>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['all', 'All'],
            ['mine', 'My Store'],
            ['resellers', 'All Resellers'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStore(value)}
            className={`min-h-11 cursor-pointer rounded-full px-3 text-xs ${
              store === value ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)] hover:bg-[var(--bg-raised)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <select value={tenant} onChange={(event) => setTenant(event.target.value)} className="btc-select" aria-label="Reseller">
          <option value="all">Reseller: All</option>
          {facets.tenants.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select value={supplier} onChange={(event) => setSupplier(event.target.value)} className="btc-select" aria-label="Supplier">
          <option value="all">Supplier: All</option>
          <option value="own">Own Products</option>
          {facets.suppliers
            .filter((name) => name !== 'Own Products')
            .map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
        </select>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full px-3 py-1 text-xs ${
              tab === item.id ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)] hover:bg-[var(--bg-raised)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by order ID (first 8 chars)"
        className="btc-input mb-4 max-w-sm"
      />
      {error ? <PageError message={error} onRetry={() => void load()} /> : null}
      {loading ? <SkeletonTable /> : null}
      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage={
          tab === 'awaiting_payment'
            ? 'No orders waiting for payment'
            : tab === 'manual_pending'
              ? 'No orders need manual attention'
              : 'No orders in this tab.'
        }
        rowKey={(row) => row.orderId}
      />
      <OrderDetailModal
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        onActionComplete={() => {
          void load();
        }}
      />
    </>
  );
}
