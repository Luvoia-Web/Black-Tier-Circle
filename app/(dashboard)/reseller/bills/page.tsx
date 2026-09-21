/**
 * @file app/(dashboard)/reseller/bills/page.tsx
 *
 * Wholesale amounts owed to the owner for sales.
 *
 * @module Dashboard
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ErrorState, TableSkeleton } from '@/components/ui/fetch-states';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import Link from 'next/link';

type Row = {
  readonly orderId: string;
  readonly productTitle: string;
  readonly quantity: number;
  readonly date: string;
  readonly sold: string;
  readonly owed: string;
};

export default function ResellerBillsPage(): JSX.Element {
  const [depositBalance, setDepositBalance] = useState('—');
  const [unpaid, setUnpaid] = useState('—');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.resellerBills);
      const json = (await response.json()) as {
        success: boolean;
        data?: { depositBalance: string; unpaidToAdmin: string; rows: Row[] };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load bills');
        return;
      }
      setDepositBalance(json.data.depositBalance);
      setUnpaid(json.data.unpaidToAdmin);
      setRows(json.data.rows);
    } catch {
      setError('Unable to load bills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ReadonlyArray<DataTableColumn<Row>> = [
    {
      key: 'product',
      header: 'Sale',
      render: (row) => `${row.productTitle} × ${row.quantity}`,
    },
    { key: 'date', header: 'Date', render: (row) => new Date(row.date).toLocaleString() },
    { key: 'sold', header: 'Amount sold', render: (row) => row.sold },
    { key: 'owed', header: 'Owed to admin', render: (row) => row.owed },
    {
      key: 'deposit',
      header: '',
      render: () => (
        <Link href={ROUTES.reseller.deposits} className="text-sm text-[var(--accent-soft)]">
          Deposit
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="My bills" description="Wholesale costs owed to the platform owner" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Deposit balance" value={depositBalance} />
        <StatCard label="Unpaid to admin" value={unpaid} />
      </div>
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <TableSkeleton />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.orderId} emptyMessage="No sales yet." />
      )}
    </>
  );
}
