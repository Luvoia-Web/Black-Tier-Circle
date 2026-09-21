/**
 * @file app/(dashboard)/reseller/customers/page.tsx
 *
 * Buyer wallet management mapped from customers.
 *
 * @module Dashboard
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ErrorState, TableSkeleton } from '@/components/ui/fetch-states';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { API_ROUTES } from '@/lib/navigation';

type Row = {
  readonly id: string;
  readonly buyer: string;
  readonly balance: string;
  readonly spent: string;
  readonly status: string;
};

type HistoryItem = {
  readonly id: string;
  readonly createdAt: string;
  readonly amount: string;
  readonly paymentStatus: string;
};

export default function ResellerCustomersPage(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState({ totalCredit: '0.00 USDT', withBalance: 0, frozen: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [withBalance, setWithBalance] = useState(false);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [amount, setAmount] = useState('1.00');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, withBalance: withBalance ? '1' : '0' });
      const response = await fetch(`${API_ROUTES.resellerCustomers}?${params.toString()}`);
      const json = (await response.json()) as {
        success: boolean;
        data?: { rows: Row[]; stats: typeof stats };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load wallets');
        return;
      }
      setRows(json.data.rows);
      setStats(json.data.stats);
    } catch {
      setError('Unable to load wallets');
    } finally {
      setLoading(false);
    }
  }, [q, withBalance]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: 'add' | 'deduct' | 'freeze' | 'unfreeze'): Promise<void> {
    const response = await fetch(API_ROUTES.resellerCustomer(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, amountUsdt: amount }),
    });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      setError(json.error?.message ?? 'Unable to update wallet');
      return;
    }
    await load();
  }

  async function showHistory(id: string): Promise<void> {
    const response = await fetch(API_ROUTES.resellerCustomer(id));
    const json = (await response.json()) as {
      success: boolean;
      data?: { history: HistoryItem[] };
    };
    if (json.success && json.data) {
      setHistory(json.data.history);
    }
  }

  const columns: ReadonlyArray<DataTableColumn<Row>> = [
    { key: 'buyer', header: 'BUYER', render: (row) => row.buyer },
    { key: 'balance', header: 'BALANCE', render: (row) => row.balance },
    { key: 'spent', header: 'SPENT', render: (row) => row.spent },
    { key: 'status', header: 'STATUS', render: (row) => row.status },
    {
      key: 'actions',
      header: 'ACTIONS',
      render: (row) => (
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" className="text-[var(--accent-soft)]" onClick={() => void showHistory(row.id)}>
            History
          </button>
          <button type="button" className="text-[var(--green)]" onClick={() => void act(row.id, 'add')}>
            + Add
          </button>
          <button type="button" className="text-[var(--amber)]" onClick={() => void act(row.id, 'deduct')}>
            − Deduct
          </button>
          <button
            type="button"
            className="text-[var(--red)]"
            onClick={() => void act(row.id, row.status === 'frozen' ? 'unfreeze' : 'freeze')}
          >
            {row.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Customer wallets"
        description="Buyer records, spend, and credit adjustments"
        actions={
          <button type="button" onClick={() => void load()} className="rounded-md border border-[var(--border-soft)] px-3 py-2 text-sm">
            Refresh
          </button>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total wallet credit" value={stats.totalCredit} />
        <StatCard label="Wallets with balance" value={String(stats.withBalance)} />
        <StatCard label="Frozen wallets" value={String(stats.frozen)} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search name, @username, or chat ID"
          className="min-w-[16rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
          <input type="checkbox" checked={withBalance} onChange={(event) => setWithBalance(event.target.checked)} />
          Only with balance
        </label>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="w-28 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-2 text-sm"
          aria-label="Adjust amount"
        />
      </div>
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <TableSkeleton />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} emptyMessage="No buyers yet." />
      )}
      {history ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-page)] p-5">
            <h2 className="text-lg font-semibold">Transaction log</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {history.length === 0 ? <li className="text-[var(--text-2)]">No orders.</li> : null}
              {history.map((item) => (
                <li key={item.id} className="flex justify-between border-b border-[var(--border)] py-2">
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                  <span>
                    {item.amount} · {item.paymentStatus}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-4 text-sm text-[var(--accent-soft)]" onClick={() => setHistory(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
