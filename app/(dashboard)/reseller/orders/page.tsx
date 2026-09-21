/**
 * @file app/(dashboard)/reseller/orders/page.tsx
 *
 * Reseller orders: search, status, period, pagination, CSV export.
 *
 * @module Dashboard
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ErrorState, TableSkeleton } from '@/components/ui/fetch-states';
import { OrderDetailModal } from '@/components/ui/OrderDetailModal';
import { PageHeader } from '@/components/ui/page-header';
import { PeriodPills } from '@/components/ui/period-pills';
import { API_ROUTES } from '@/lib/navigation';
import type { DashboardPeriod } from '@/lib/period';

type Row = {
  readonly orderId: string;
  readonly createdAt: string;
  readonly productTitle: string;
  readonly customerLabel: string;
  readonly quantity: number;
  readonly total: string;
  readonly method: string;
  readonly badge: 'paid' | 'pending' | 'failed' | 'refunded';
};

const STATUS_PILLS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'paid', label: 'Paid' },
  { id: 'pending', label: 'Pending' },
  { id: 'failed', label: 'Failed' },
  { id: 'refunded', label: 'Refunded' },
];

function badgeClass(badge: Row['badge']): string {
  if (badge === 'paid') {
    return 'bg-[var(--green-soft)] text-[var(--green)]';
  }
  if (badge === 'pending') {
    return 'bg-[var(--amber-soft)] text-[var(--amber)]';
  }
  if (badge === 'failed') {
    return 'bg-[var(--red-soft)] text-[var(--red)]';
  }
  return 'bg-[var(--bg-raised)] text-[var(--text-2)]';
}

export default function ResellerOrdersPage(): JSX.Element {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [period, setPeriod] = useState<DashboardPeriod>('lifetime');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q,
        status,
        period,
        page: String(page),
        pageSize: String(pageSize),
      });
      const response = await fetch(`${API_ROUTES.resellerOrders}?${params.toString()}`);
      const json = (await response.json()) as {
        success: boolean;
        data?: { rows: Row[]; total: number };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load orders');
        return;
      }
      setRows(json.data.rows);
      setTotal(json.data.total);
    } catch {
      setError('Unable to load orders');
    } finally {
      setLoading(false);
    }
  }, [q, status, period, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCsv(): void {
    const header = 'DATE,PRODUCT,CUSTOMER,QTY,TOTAL,METHOD,STATUS,ORDER_ID';
    const body = rows
      .map((row) =>
        [row.createdAt, row.productTitle, row.customerLabel, row.quantity, row.total, row.method, row.badge, row.orderId]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'orders.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const columns: ReadonlyArray<DataTableColumn<Row>> = [
    { key: 'date', header: 'DATE', render: (row) => new Date(row.createdAt).toLocaleString() },
    { key: 'product', header: 'PRODUCT', render: (row) => row.productTitle },
    { key: 'customer', header: 'CUSTOMER', render: (row) => row.customerLabel },
    { key: 'qty', header: 'QTY', render: (row) => String(row.quantity) },
    { key: 'total', header: 'TOTAL', render: (row) => row.total },
    { key: 'method', header: 'METHOD', render: (row) => row.method },
    {
      key: 'status',
      header: 'STATUS',
      render: (row) => (
        <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClass(row.badge)}`}>{row.badge}</span>
      ),
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
      <PageHeader
        title="Orders"
        description="Search, filter, and export customer orders"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <PeriodPills
              value={period}
              onChange={(next) => {
                setPage(1);
                setPeriod(next);
              }}
            />
            <button type="button" onClick={exportCsv} className="btc-btn-primary">
              Export CSV
            </button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap gap-1">
        {STATUS_PILLS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setPage(1);
              setStatus(item.id);
            }}
            className={`rounded-full px-3 py-1 text-xs ${
              status === item.id
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-2)] hover:bg-[var(--bg-raised)]'
            }`}
          >
            {item.label}
            {status === item.id ? ` (${total})` : ''}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(event) => {
            setPage(1);
            setQ(event.target.value);
          }}
          placeholder="Search order ID, customer, product"
          className="btc-input min-w-[16rem] flex-1"
        />
        <select
          value={pageSize}
          onChange={(event) => {
            setPage(1);
            setPageSize(Number(event.target.value));
          }}
          className="btc-select"
        >
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
      </div>
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <TableSkeleton />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.orderId} emptyMessage="No orders match these filters." />
      )}
      <div className="mt-4 flex items-center justify-between text-sm text-[var(--text-2)]">
        <span>
          {total} results · page {page}
        </span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="disabled:opacity-40">
            Previous
          </button>
          <button
            type="button"
            disabled={page * pageSize >= total}
            onClick={() => setPage((value) => value + 1)}
            className="disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
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
