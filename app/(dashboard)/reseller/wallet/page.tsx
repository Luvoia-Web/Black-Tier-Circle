/**
 * @file app/(dashboard)/reseller/wallet/page.tsx
 *
 * Reseller wallet: balances, token redemption, and recent ledger entries.
 *
 * @module Dashboard
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { amountClassName, ledgerTypeLabel } from '@/components/wallet/ledger-badges';
import { formatUsdt } from '@/lib/money';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { LedgerEntryType } from '@/modules/wallet/types';

type BalancePayload = {
  readonly balanceTotal: string;
  readonly balanceReserved: string;
  readonly balanceAvailable: string;
};

type LedgerRow = {
  readonly id: string;
  readonly entryType: LedgerEntryType;
  readonly amount: string;
  readonly createdAt: string;
  readonly note: string | null;
};

function isValidTokenFormat(token: string): boolean {
  return /^[1-9][0-9]{11}$/.test(token);
}

/**
 * Reseller wallet home.
 */
export default function ResellerWalletPage(): JSX.Element {
  const [balances, setBalances] = useState<BalancePayload | null>(null);
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const digitsOnly = token.replace(/\D/g, '').slice(0, 12);
  const formatValid = useMemo(() => isValidTokenFormat(digitsOnly), [digitsOnly]);

  const load = useCallback(async (): Promise<void> => {
    const [walletRes, ledgerRes] = await Promise.all([fetch(API_ROUTES.wallet), fetch(`${API_ROUTES.walletLedger}?page=1&limit=10`)]);
    const walletJson = (await walletRes.json()) as {
      success: boolean;
      data?: BalancePayload;
      error?: { message: string };
    };
    const ledgerJson = (await ledgerRes.json()) as {
      success: boolean;
      data?: { entries: LedgerRow[] };
    };
    if (walletJson.success && walletJson.data) {
      setBalances(walletJson.data);
    } else {
      setError(walletJson.error?.message ?? 'Unable to load wallet');
    }
    if (ledgerJson.success && ledgerJson.data) {
      setEntries(ledgerJson.data.entries);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function redeem(): Promise<void> {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(API_ROUTES.walletRedeem, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: digitsOnly }),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: { amountCredited: string };
        error?: { code: string; message: string };
      };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to redeem token');
        return;
      }
      const credited = json.data?.amountCredited ? formatUsdt(BigInt(json.data.amountCredited)) : '';
      setMessage(`${credited} added to your wallet`);
      setToken('');
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="Wallet" description="USDT balance and top-up token redemption" />
      {balances ? (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
            <p className="text-sm text-gray-400">Total Balance</p>
            <p className="mt-2 text-2xl font-semibold">{formatUsdt(BigInt(balances.balanceTotal))}</p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-5" title="Held for pending orders">
            <p className="text-sm text-gray-500">Reserved</p>
            <p className="mt-2 text-2xl font-semibold text-gray-500">{formatUsdt(BigInt(balances.balanceReserved))}</p>
            <p className="mt-1 text-xs text-gray-500">Held for pending orders</p>
          </div>
          <div className="rounded-lg border border-indigo-600 bg-indigo-950/50 p-5">
            <p className="text-sm text-indigo-300">Available</p>
            <p className="mt-2 text-2xl font-semibold text-indigo-100">
              {formatUsdt(BigInt(balances.balanceAvailable))}
            </p>
          </div>
        </div>
      ) : null}

      <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-medium text-gray-200">Redeem top-up token</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            inputMode="numeric"
            value={digitsOnly}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Enter 12-digit top-up token"
            className="flex-1 rounded-md border border-gray-700 bg-gray-950 px-3 py-2 font-mono tracking-widest"
          />
          <button
            type="button"
            disabled={!formatValid || submitting}
            onClick={() => void redeem()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Redeem
          </button>
        </div>
        {digitsOnly.length > 0 && !formatValid ? (
          <p className="mt-2 text-xs text-yellow-400">Token must be exactly 12 digits and not start with 0.</p>
        ) : null}
        {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-400">Recent transactions</h2>
          <Link href={ROUTES.reseller.walletHistory} className="text-sm text-indigo-400 hover:text-indigo-300">
            View full history
          </Link>
        </div>
        {entries.length === 0 ? (
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-6 py-12 text-center text-sm text-gray-400">
            No transactions yet
          </div>
        ) : (
          <ul className="divide-y divide-gray-800 overflow-hidden rounded-lg border border-gray-800">
            {entries.map((entry) => {
              const amountMinor = BigInt(entry.amount);
              const sign = amountMinor > 0n ? '+' : '';
              return (
                <li key={entry.id} className="flex items-center justify-between bg-gray-950 px-4 py-3">
                  <div>
                    <p className="text-sm text-gray-100">{ledgerTypeLabel(entry.entryType)}</p>
                    <p className="text-xs text-gray-500">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={`text-sm font-medium ${amountClassName(entry.entryType, amountMinor)}`}>
                    {sign}
                    {formatUsdt(amountMinor)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
