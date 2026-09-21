/**
 * @file app/(dashboard)/reseller/wallet/history/page.tsx
 *
 * Paginated reseller ledger history with date filters and CSV export.
 *
 * @module Dashboard
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { amountClassName, ledgerTypeLabel } from '@/components/wallet/ledger-badges';
import { formatUsdt } from '@/lib/money';
import { API_ROUTES } from '@/lib/navigation';
import type { LedgerEntryType } from '@/modules/wallet/types';

type LedgerRow = {
  readonly id: string;
  readonly entryType: LedgerEntryType;
  readonly amount: string;
  readonly balanceAfter: string;
  readonly note: string | null;
  readonly createdAt: string;
};

function toDateInput(date: Date): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Full wallet history for the signed-in reseller.
 */
export default function ResellerWalletHistoryPage(): JSX.Element {
  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const value = new Date(today);
    value.setDate(value.getDate() - 30);
    return value;
  }, [today]);
  const [from, setFrom] = useState(toDateInput(defaultFrom));
  const [to, setTo] = useState(toDateInput(today));
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    const params = new URLSearchParams({
      from: new Date(`${from}T00:00:00.000Z`).toISOString(),
      to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    });
    const response = await fetch(`${API_ROUTES.walletStatement}?${params.toString()}`);
    const json = (await response.json()) as {
      success: boolean;
      data?: { entries: LedgerRow[] };
      error?: { message: string };
    };
    if (!json.success || !json.data) {
      setError(json.error?.message ?? 'Unable to load history');
      setEntries([]);
      return;
    }
    setEntries(json.data.entries);
    setPage(1);
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const paged = entries.slice((page - 1) * pageSize, page * pageSize);

  function downloadCsv(): void {
    const header = 'Date,Type,Description,Amount,Balance After';
    const lines = entries.map((row) => {
      const amountMinor = BigInt(row.amount);
      const cells = [
        new Date(row.createdAt).toISOString(),
        ledgerTypeLabel(row.entryType),
        (row.note ?? '').replaceAll(',', ' '),
        formatUsdt(amountMinor),
        formatUsdt(BigInt(row.balanceAfter)),
      ];
      return cells.join(',');
    });
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'wallet-history.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const columns: ReadonlyArray<DataTableColumn<LedgerRow>> = [
    { key: 'date', header: 'Date', render: (row) => new Date(row.createdAt).toLocaleString() },
    { key: 'type', header: 'Type', render: (row) => ledgerTypeLabel(row.entryType) },
    { key: 'description', header: 'Description', render: (row) => row.note ?? '—' },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => {
        const amountMinor = BigInt(row.amount);
        const sign = amountMinor > 0n ? '+' : '';
        return (
          <span className={amountClassName(row.entryType, amountMinor)}>
            {sign}
            {formatUsdt(amountMinor)}
          </span>
        );
      },
    },
    { key: 'after', header: 'Balance after', render: (row) => formatUsdt(BigInt(row.balanceAfter)) },
  ];

  return (
    <>
      <PageHeader
        title="Wallet history"
        description="Immutable ledger of credits, debits, and reservations"
        actions={
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded-md bg-[var(--bg-raised)] px-4 py-2 text-sm text-[var(--text-1)] hover:bg-[var(--bg-hover)]"
          >
            Download CSV
          </button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="text-sm text-[var(--text-2)]">
          From
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="ml-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-2 py-1"
          />
        </label>
        <label className="text-sm text-[var(--text-2)]">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="ml-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-2 py-1"
          />
        </label>
      </div>
      {error ? <p className="mb-3 text-sm text-[var(--red)]">{error}</p> : null}
      <DataTable columns={columns} rows={paged} rowKey={(row) => row.id} emptyMessage="No ledger entries in this range" />
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
          className="text-sm text-[var(--text-2)] disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page * pageSize >= entries.length}
          onClick={() => setPage((value) => value + 1)}
          className="text-sm text-[var(--text-2)] disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </>
  );
}
