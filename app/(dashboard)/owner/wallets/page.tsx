/**
 * @file app/(dashboard)/owner/wallets/page.tsx
 *
 * Owner overview of reseller wallets with manual credit/debit adjustments.
 *
 * @module Dashboard
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DocumentTitle } from '@/components/ui/DocumentTitle';
import { PageError } from '@/components/ui/PageError';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { AnimatedCounter } from '@/components/motion/AnimatedCounter';
import { formatRelativeTime } from '@/lib/relative-time';
import { formatUsdt } from '@/lib/money';
import { API_ROUTES, ROUTES } from '@/lib/navigation';

type OwnerWallet = {
  readonly totalMinor: string;
  readonly availableMinor: string;
  readonly reservedMinor: string;
  readonly recent: ReadonlyArray<{ readonly id: string; readonly amountMinor: string; readonly createdAt: string }>;
};

type WalletRow = {
  readonly walletId: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly resellerName: string;
  readonly balanceTotal: string;
  readonly balanceReserved: string;
  readonly balanceAvailable: string;
  readonly lastActivityAt: string;
};

/**
 * Owner wallet list.
 */
export default function OwnerWalletsPage(): JSX.Element {
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [owner, setOwner] = useState<OwnerWallet | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [mode, setMode] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.adminWallets);
      const json = (await response.json()) as {
        success: boolean;
        data?: { wallets: WalletRow[]; owner: OwnerWallet };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load wallets');
        setRows([]);
        return;
      }
      setRows(json.data.wallets);
      setOwner(json.data.owner);
    } catch {
      setError('Unable to load wallets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitAdjust(): Promise<void> {
    if (!adjustId) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = mode === 'credit' ? API_ROUTES.adminWalletCredit(adjustId) : API_ROUTES.adminWalletDebit(adjustId);
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
      toast.success('Wallet adjusted');
      setAdjustId(null);
      setAmount('');
      setNote('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  const columns: ReadonlyArray<DataTableColumn<WalletRow>> = [
    { key: 'reseller', header: 'Reseller name', render: (row) => row.resellerName },
    { key: 'tenant', header: 'Tenant name', render: (row) => row.tenantName },
    { key: 'total', header: 'Total balance', render: (row) => formatUsdt(BigInt(row.balanceTotal)) },
    { key: 'reserved', header: 'Reserved', render: (row) => formatUsdt(BigInt(row.balanceReserved)) },
    { key: 'available', header: 'Available', render: (row) => formatUsdt(BigInt(row.balanceAvailable)) },
    {
      key: 'activity',
      header: 'Last activity',
      render: (row) => formatRelativeTime(row.lastActivityAt),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex gap-3">
          <Link href={ROUTES.owner.walletDetail(row.walletId)} className="text-sm text-[var(--accent-soft)] hover:text-[var(--accent)]">
            View
          </Link>
          <button
            type="button"
            className="text-sm text-[var(--text-2)] hover:text-white"
            onClick={() => {
              setAdjustId(row.walletId);
              setMode('credit');
            }}
          >
            Adjust Balance
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DocumentTitle title="Wallets — Black Tier Circle" />
      <PageHeader title="Wallets" description="Your store revenue, then reseller prepaid balances" />
      {owner ? (
        <section className="mb-8 rounded-2xl border border-[var(--accent)]/30 bg-[var(--bg-card)] p-6">
          <h2 className="text-sm font-semibold tracking-wide text-[var(--accent-soft)]">MY WALLET</h2>
          <p className="mt-1 text-sm text-[var(--text-2)]">Revenue from your own store bot</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-[var(--text-3)]">Total balance</p>
              <p className="text-2xl font-semibold text-[var(--text-1)]">
                <AnimatedCounter value={Number(owner.totalMinor) / 1_000_000} decimals={2} suffix=" USDT" />
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-3)]">Available</p>
              <p className="text-lg text-[var(--text-1)]">{formatUsdt(BigInt(owner.availableMinor))}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-3)]">Reserved</p>
              <p className="text-lg text-[var(--text-1)]">{formatUsdt(BigInt(owner.reservedMinor))}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {owner.recent.length === 0 ? (
              <li className="text-sm text-[var(--text-3)]">No paid orders from your store yet.</li>
            ) : (
              owner.recent.map((item) => (
                <li key={item.id} className="flex justify-between text-sm">
                  <span className="text-[var(--text-2)]">{item.id.slice(0, 8).toUpperCase()}</span>
                  <span>
                    {formatUsdt(BigInt(item.amountMinor))} · {formatRelativeTime(item.createdAt)}
                  </span>
                </li>
              ))
            )}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={`${ROUTES.owner.orders}?store=mine`} className="btc-btn-secondary">
              View full ledger
            </Link>
            <Link href={ROUTES.owner.tokens} className="btc-btn-primary">
              Generate top-up token
            </Link>
          </div>
        </section>
      ) : null}
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--text-2)]">RESELLER WALLETS ({rows.length})</h2>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search resellers"
        aria-label="Search resellers"
        className="btc-input mb-4 max-w-sm"
      />
      {error ? <PageError message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <SkeletonTable />
      ) : (
        <DataTable
          columns={columns}
          rows={rows.filter((row) => {
            const needle = search.trim().toLowerCase();
            return needle.length === 0 || `${row.resellerName} ${row.tenantName}`.toLowerCase().includes(needle);
          })}
          rowKey={(row) => row.walletId}
          emptyMessage="No reseller wallets yet"
        />
      )}

      {adjustId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-medium text-[var(--text-1)]">Adjust balance</h2>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setMode('credit')}
                className={`rounded-md px-3 py-1 text-sm ${mode === 'credit' ? 'bg-emerald-700 text-white' : 'bg-[var(--bg-raised)] text-[var(--text-2)]'}`}
              >
                Credit
              </button>
              <button
                type="button"
                onClick={() => setMode('debit')}
                className={`rounded-md px-3 py-1 text-sm ${mode === 'debit' ? 'bg-red-800 text-white' : 'bg-[var(--bg-raised)] text-[var(--text-2)]'}`}
              >
                Debit
              </button>
            </div>
            <label className="mt-4 block text-sm text-[var(--text-2)]">
              Amount (USDT)
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm text-[var(--text-2)]">
              Note
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="text-sm text-[var(--text-2)]" onClick={() => setAdjustId(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitAdjust()}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
