/**
 * @file app/(dashboard)/owner/wallets/[walletId]/page.tsx
 *
 * Owner wallet detail: balances, manual adjustment, and paginated ledger.
 *
 * @module Dashboard
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { amountClassName, ledgerTypeLabel } from '@/components/wallet/ledger-badges';
import { formatUsdt } from '@/lib/money';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { LedgerEntryType } from '@/modules/wallet/types';

type WalletPayload = {
  readonly id: string;
  readonly tenantId: string;
  readonly balanceTotal: string;
  readonly balanceReserved: string;
  readonly balanceAvailable: string;
};

type LedgerRow = {
  readonly id: string;
  readonly entryType: LedgerEntryType;
  readonly amount: string;
  readonly balanceAfter: string;
  readonly referenceId: string | null;
  readonly note: string | null;
  readonly createdAt: string;
};

type PageProps = {
  readonly params: { readonly walletId: string };
};

/**
 * Wallet detail for a single reseller.
 */
export default function OwnerWalletDetailPage({ params }: PageProps): JSX.Element {
  const [wallet, setWallet] = useState<WalletPayload | null>(null);
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    const response = await fetch(`${API_ROUTES.adminWallet(params.walletId)}?page=${page}`);
    const json = (await response.json()) as {
      success: boolean;
      data?: { wallet: WalletPayload; entries: LedgerRow[] };
      error?: { message: string };
    };
    if (!json.success || !json.data) {
      setError(json.error?.message ?? 'Unable to load wallet');
      return;
    }
    setWallet(json.data.wallet);
    setEntries(json.data.entries);
  }, [page, params.walletId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitAdjust(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const url =
        mode === 'credit'
          ? API_ROUTES.adminWalletCredit(params.walletId)
          : API_ROUTES.adminWalletDebit(params.walletId);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsdtStr: amount, note }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to adjust wallet');
        return;
      }
      setAmount('');
      setNote('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  const columns: ReadonlyArray<DataTableColumn<LedgerRow>> = [
    { key: 'date', header: 'Date', render: (row) => new Date(row.createdAt).toLocaleString() },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs">{ledgerTypeLabel(row.entryType)}</span>
      ),
    },
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
    { key: 'ref', header: 'Reference', render: (row) => row.referenceId ?? '—' },
    { key: 'note', header: 'Note', render: (row) => row.note ?? '—' },
  ];

  return (
    <>
      <PageHeader
        title="Wallet detail"
        description="Manual adjustments write an immutable ledger entry"
        actions={
          <Link href={ROUTES.owner.wallets} className="text-sm text-indigo-400 hover:text-indigo-300">
            Back to wallets
          </Link>
        }
      />
      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
      {wallet ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <p className="text-sm text-gray-400">Total</p>
            <p className="mt-1 text-xl font-semibold">{formatUsdt(BigInt(wallet.balanceTotal))}</p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <p className="text-sm text-gray-400">Reserved</p>
            <p className="mt-1 text-xl font-semibold text-gray-400">{formatUsdt(BigInt(wallet.balanceReserved))}</p>
          </div>
          <div className="rounded-lg border border-indigo-700 bg-indigo-950/40 p-4">
            <p className="text-sm text-indigo-300">Available</p>
            <p className="mt-1 text-xl font-semibold">{formatUsdt(BigInt(wallet.balanceAvailable))}</p>
          </div>
        </div>
      ) : null}

      <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-medium text-gray-200">Manual adjustment</h2>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('credit')}
            className={`rounded-md px-3 py-1 text-sm ${mode === 'credit' ? 'bg-emerald-700 text-white' : 'bg-gray-800 text-gray-300'}`}
          >
            Credit
          </button>
          <button
            type="button"
            onClick={() => setMode('debit')}
            className={`rounded-md px-3 py-1 text-sm ${mode === 'debit' ? 'bg-red-800 text-white' : 'bg-gray-800 text-gray-300'}`}
          >
            Debit
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Amount (USDT)"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm"
          />
          <input
            placeholder="Note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submitAdjust()}
          className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Apply
        </button>
      </section>

      <DataTable columns={columns} rows={entries} rowKey={(row) => row.id} emptyMessage="No ledger entries yet" />
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
          className="text-sm text-gray-300 disabled:opacity-40"
        >
          Previous
        </button>
        <button type="button" onClick={() => setPage((value) => value + 1)} className="text-sm text-gray-300">
          Next
        </button>
      </div>
    </>
  );
}
