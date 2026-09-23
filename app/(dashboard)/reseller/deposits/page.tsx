/**
 * @file app/(dashboard)/reseller/deposits/page.tsx
 *
 * Token redemption, deposit status table, and audit log.
 *
 * @module Dashboard
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ErrorState, EmptyState, TableSkeleton } from '@/components/ui/fetch-states';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { formatUsdt } from '@/lib/money';
import { API_ROUTES } from '@/lib/navigation';

type Payload = {
  readonly wallet?: {
    readonly availableMinor: string;
    readonly totalMinor: string;
    readonly reservedMinor?: string;
  };
  readonly tokens: ReadonlyArray<{
    readonly id: string;
    readonly prefix: string;
    readonly amount: string;
    readonly status: string;
    readonly date: string;
  }>;
  readonly deposits: {
    readonly totalCredited: string;
    readonly approved: number;
    readonly pending: number;
    readonly failed: number;
    readonly rows: ReadonlyArray<{
      readonly status: 'approved' | 'pending' | 'failed';
      readonly source: string;
      readonly txid: string;
      readonly endpoint: string;
      readonly result: string;
      readonly credited: string;
      readonly user: string;
      readonly when: string;
    }>;
  };
  readonly audit: ReadonlyArray<{
    readonly id: string;
    readonly eventType: string;
    readonly user: string;
    readonly amount: string;
    readonly method: string;
    readonly description: string;
    readonly timestamp: string;
  }>;
};

function formatUsdtDisplay(minor: string): string {
  try {
    return formatUsdt(BigInt(minor));
  } catch {
    return '0.00 USDT';
  }
}

function statusClass(status: string): string {
  if (status === 'approved') {
    return 'text-[var(--green)]';
  }
  if (status === 'pending') {
    return 'text-[var(--amber)]';
  }
  return 'text-[var(--red)]';
}

function auditDotClass(eventType: string): string {
  const lowered = eventType.toLowerCase();
  if (lowered.includes('fail') || lowered.includes('reject')) {
    return 'bg-[var(--red)]';
  }
  if (lowered.includes('pend')) {
    return 'bg-[var(--amber)]';
  }
  return 'bg-[var(--green)]';
}

export default function ResellerDepositsPage(): JSX.Element {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const digitsOnly = token.replace(/\D/g, '').slice(0, 12);
  const formatValid = useMemo(() => /^[1-9][0-9]{11}$/.test(digitsOnly), [digitsOnly]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, status, source });
      const response = await fetch(`${API_ROUTES.resellerDeposits}?${params.toString()}`);
      const json = (await response.json()) as { success: boolean; data?: Payload; error?: { message: string } };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load deposits');
        return;
      }
      setData(json.data);
    } catch {
      setError('Unable to load deposits');
    } finally {
      setLoading(false);
    }
  }, [q, status, source]);

  useEffect(() => {
    void load();
  }, [load]);

  async function redeem(): Promise<void> {
    const response = await fetch(API_ROUTES.walletRedeem, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: digitsOnly }),
    });
    const json = (await response.json()) as {
      success: boolean;
      data?: { amountCredited?: string; newBalance?: string };
      error?: { message: string };
    };
    if (!json.success) {
      setError(json.error?.message ?? 'Unable to redeem token');
      toast.error(json.error?.message ?? 'Unable to redeem token');
      return;
    }
    const added = json.data?.amountCredited ? formatUsdt(BigInt(json.data.amountCredited)) : '';
    const next = json.data?.newBalance ? formatUsdt(BigInt(json.data.newBalance)) : '';
    const notice =
      added && next ? `+${added} added. New balance: ${next}` : 'Token redeemed';
    setMessage(notice);
    toast.success(notice);
    setToken('');
    await load();
  }

  const tokenColumns: ReadonlyArray<DataTableColumn<Payload['tokens'][number]>> = [
    { key: 'prefix', header: 'Token', render: (row) => `${row.prefix}••••` },
    { key: 'amount', header: 'Amount', render: (row) => row.amount },
    { key: 'status', header: 'Status', render: (row) => row.status },
    { key: 'date', header: 'Date', render: (row) => new Date(row.date).toLocaleString() },
  ];

  const depositColumns: ReadonlyArray<DataTableColumn<Payload['deposits']['rows'][number]>> = [
    {
      key: 'status',
      header: 'STATUS',
      render: (row) => <span className={statusClass(row.status)}>{row.status}</span>,
    },
    { key: 'source', header: 'SOURCE', render: (row) => row.source },
    { key: 'txid', header: 'TXID/NOTE', render: (row) => row.txid },
    { key: 'endpoint', header: 'ENDPOINT', render: (row) => row.endpoint },
    { key: 'result', header: 'RESULT', render: (row) => row.result },
    { key: 'credited', header: 'CREDITED', render: (row) => row.credited },
    { key: 'user', header: 'USER', render: (row) => row.user },
    { key: 'when', header: 'WHEN', render: (row) => new Date(row.when).toLocaleString() },
  ];

  return (
    <>
      <PageHeader title="Wallet & Deposits" description="Redeem tokens and review payment deposits" />
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading || !data ? (
        <TableSkeleton />
      ) : (
        <>
          {data.wallet ? (
            <section className="mb-6 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <p className="text-xs text-[var(--text-3)]">Total Balance</p>
              <p className="text-2xl font-semibold">
                {formatUsdtDisplay(data.wallet.totalMinor)}
              </p>
              <div className="mt-3 flex flex-wrap gap-6 text-sm">
                <span className="text-[var(--green)]">
                  Available {formatUsdtDisplay(data.wallet.availableMinor)}
                </span>
                <span className="text-[var(--text-3)]">
                  Reserved {formatUsdtDisplay(data.wallet.reservedMinor ?? '0')}
                </span>
              </div>
            </section>
          ) : null}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total credited" value={data.deposits.totalCredited} />
            <StatCard label="Approved" value={String(data.deposits.approved)} />
            <StatCard label="Pending" value={String(data.deposits.pending)} />
            <StatCard label="Failed" value={String(data.deposits.failed)} />
          </div>
          <section className="mb-8 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-sm font-medium text-[var(--text-1)]">Deposit Tokens</h2>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                value={digitsOnly}
                onChange={(event) => setToken(event.target.value)}
                placeholder="12-digit token"
                className="btc-input flex-1 font-mono tracking-widest"
              />
              <button
                type="button"
                disabled={!formatValid}
                onClick={() => void redeem()}
                className="btc-btn-primary"
              >
                Redeem
              </button>
            </div>
            {message ? <p className="mt-2 text-sm text-[var(--green)]">{message}</p> : null}
            <div className="mt-5">
              <DataTable
                columns={tokenColumns}
                rows={data.tokens}
                rowKey={(row) => row.id}
                emptyMessage="No tokens assigned yet."
              />
            </div>
          </section>
          <h2 className="mb-3 text-sm font-medium text-[var(--text-2)]">Transaction History</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search TxID / user / note"
              className="btc-input max-w-xs"
            />
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="btc-select">
              <option value="all">All statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
            <select value={source} onChange={(event) => setSource(event.target.value)} className="btc-select">
              <option value="all">All sources</option>
              <option value="binance_pay">Binance Pay</option>
              <option value="usdt_bep20">USDT BEP20</option>
            </select>
          </div>
          <DataTable
            columns={depositColumns}
            rows={data.deposits.rows}
            rowKey={(row) => `${row.txid}-${row.when}`}
            emptyMessage="No deposit records."
          />
          <h2 className="mb-3 mt-8 text-sm font-medium text-[var(--text-2)]">Audit Log</h2>
          {data.audit.length === 0 ? (
            <EmptyState message="No audit events yet." />
          ) : (
            <ul className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
              {data.audit.map((row) => (
                <li key={row.id} className="flex items-start gap-3 border-b border-[var(--border)] py-3 last:border-0 last:pb-0 first:pt-0">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${auditDotClass(row.eventType)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--text-1)]">{row.description}</p>
                    <p className="text-xs text-[var(--text-3)]">
                      {row.user} · {row.amount} · {row.method}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--text-3)]">
                    {new Date(row.timestamp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
