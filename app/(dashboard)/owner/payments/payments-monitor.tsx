'use client';

/**
 * @file app/(dashboard)/owner/payments/payments-monitor.tsx
 *
 * Client payment monitoring table with tabs and auto-refresh.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES, ROUTES } from '@/lib/navigation';

type Tab = 'pending' | 'verified' | 'failed' | 'all';

type PaymentRow = {
  readonly orderId: string;
  readonly channel: string;
  readonly productTitle: string;
  readonly amount: string;
  readonly method: string | null;
  readonly submittedAt: string;
  readonly paymentStatus: string;
};

type PaymentsMonitorProps = {
  readonly modeLabel: string;
};

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'verified', label: 'Verified' },
  { id: 'failed', label: 'Failed' },
  { id: 'all', label: 'All' },
];

function statusClass(status: string): string {
  if (status === 'verified') {
    return 'bg-emerald-500/10 text-emerald-400';
  }
  if (status === 'failed' || status === 'expired') {
    return 'bg-red-500/10 text-red-400';
  }
  if (status === 'pending_verification') {
    return 'bg-yellow-500/10 text-yellow-400';
  }
  return 'bg-gray-500/10 text-gray-300';
}

/**
 * Owner payment monitoring UI.
 */
export function PaymentsMonitor({ modeLabel }: PaymentsMonitorProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('pending');
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_ROUTES.adminPayments}?tab=${tab}`);
      const json = (await response.json()) as {
        success: boolean;
        data?: { rows: PaymentRow[] };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load payments');
        setRows([]);
        return;
      }
      setRows(json.data.rows);
    } catch {
      setError('Unable to load payments');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }
    const timer = setInterval(() => {
      void load();
    }, 30_000);
    return () => {
      clearInterval(timer);
    };
  }, [autoRefresh, load]);

  const columns: ReadonlyArray<DataTableColumn<PaymentRow>> = [
    {
      key: 'orderId',
      header: 'Order ID',
      render: (row) => row.orderId.slice(0, 8).toUpperCase(),
    },
    { key: 'channel', header: 'Channel', render: (row) => row.channel },
    { key: 'product', header: 'Product', render: (row) => row.productTitle },
    { key: 'amount', header: 'Amount', render: (row) => row.amount },
    { key: 'method', header: 'Method', render: (row) => row.method ?? '—' },
    {
      key: 'submitted',
      header: 'Submitted',
      render: (row) => new Date(row.submittedAt).toLocaleString(),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(row.paymentStatus)}`}>
          {row.paymentStatus.replaceAll('_', ' ')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) =>
        row.paymentStatus === 'pending_verification' ? (
          <Link
            href={ROUTES.owner.paymentDetail(row.orderId)}
            className="text-indigo-400 hover:text-indigo-300"
          >
            Review
          </Link>
        ) : (
          <Link href={ROUTES.owner.paymentDetail(row.orderId)} className="text-gray-400 hover:text-gray-200">
            View
          </Link>
        ),
    },
  ];

  const emptyMessage =
    tab === 'pending'
      ? 'No payments waiting for verification.'
      : tab === 'verified'
        ? 'No verified payments yet.'
        : tab === 'failed'
          ? 'No failed payments.'
          : 'No payments yet.';

  return (
    <>
      <PageHeader
        title="Payment Monitoring"
        description="Review Binance Pay and BEP20 claims"
        actions={
          <span className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">{modeLabel}</span>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                tab === item.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
          />
          Auto-refresh (30s)
        </label>
      </div>
      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <DataTable columns={columns} rows={rows} emptyMessage={emptyMessage} rowKey={(row) => row.orderId} />
      )}
    </>
  );
}
