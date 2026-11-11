'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { PUBLIC_ADDRESS_NOTE } from '@/lib/eth-address';
import { API_ROUTES } from '@/lib/navigation';

type Health = {
  readonly address: string | null;
  readonly addressValid: boolean;
  readonly provider: 'ok' | 'down';
  readonly confirmations: number;
};

type Row = {
  readonly id: string;
  readonly buyer: string;
  readonly status: string;
  readonly amount: string;
  readonly creditedAmount: string | null;
  readonly txHash: string | null;
  readonly explorerUrl: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly creditedAt: string | null;
  readonly rejectReason: string | null;
};

type Payload = {
  readonly health: Health | null;
  readonly rows: Row[];
  readonly page: number;
  readonly hasMore: boolean;
  readonly note: string;
};

const STATUSES = ['all', 'pending', 'credited', 'expired', 'failed', 'rejected'] as const;

function statusClass(status: string): string {
  if (status === 'credited') {
    return 'bg-[var(--green-soft)] text-[var(--green)]';
  }
  if (status === 'failed' || status === 'rejected' || status === 'expired') {
    return 'bg-[var(--red-soft)] text-[var(--red)]';
  }
  return 'bg-[var(--amber-soft)] text-[var(--amber)]';
}

export function TopupAdmin(): JSX.Element {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Payload | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status, q: query, page: String(page), health: health ? '0' : '1' });
      const response = await fetch(`${API_ROUTES.paymentTopups}?${params.toString()}`);
      const json = (await response.json()) as { success: boolean; data?: Payload; error?: { message: string } };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load top-ups');
        setData(null);
        return;
      }
      if (json.data.health) {
        setHealth(json.data.health);
      }
      setData(json.data);
    } catch {
      setError('Unable to load top-ups');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [health, page, query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(row: Row, decision: 'approve' | 'reject'): Promise<void> {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.paymentTopup(row.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason, ...(hash.trim() ? { txHash: hash.trim() } : {}) }),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: { success: boolean; repeated: boolean; errorCode: string | null };
        error?: { message: string };
      };
      if (!json.success || !json.data?.success) {
        setError(json.error?.message ?? json.data?.errorCode ?? 'The review was not saved');
        return;
      }
      setNotice(json.data.repeated ? 'This top-up was already credited. Nothing was added again.' : 'Review saved.');
      setActiveId(null);
      setReason('');
      setHash('');
      await load();
    } catch {
      setError('The review was not saved');
    } finally {
      setBusy(false);
    }
  }

  const columns: ReadonlyArray<DataTableColumn<Row>> = [
    { key: 'buyer', header: 'Buyer', render: (row) => row.buyer },
    { key: 'amount', header: 'Amount', render: (row) => row.creditedAmount ?? row.amount },
    { key: 'status', header: 'Status', render: (row) => <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(row.status)}`}>{row.status}</span> },
    {
      key: 'hash',
      header: 'Transaction',
      render: (row) =>
        row.explorerUrl && row.txHash ? (
          <a className="text-[var(--accent)] underline" href={row.explorerUrl} target="_blank" rel="noreferrer">
            {row.txHash.slice(0, 10)}…
          </a>
        ) : (
          row.txHash ?? '—'
        ),
    },
    { key: 'created', header: 'Created', render: (row) => new Date(row.createdAt).toLocaleString() },
    {
      key: 'review',
      header: 'Review',
      render: (row) =>
        row.status === 'pending' ? (
          <button type="button" className="cursor-pointer text-[var(--accent)]" onClick={() => setActiveId(row.id)}>
            Review
          </button>
        ) : (
          '—'
        ),
    },
  ];

  const active = data?.rows.find((row) => row.id === activeId) ?? null;

  return (
    <section className="mt-10">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-[var(--text-1)]">Wallet top-ups</h2>
        <p className="mt-1 text-sm text-[var(--text-2)]">USDT on BNB Smart Chain. A credit needs a chain check, or a manual review with a reason.</p>
      </div>
      <p className="mb-4 text-sm text-[var(--text-2)]">{data?.note ?? PUBLIC_ADDRESS_NOTE}</p>
      {health ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-xs text-[var(--text-2)]">Receiving address</p>
            <p className={`mt-1 break-all text-sm ${health.addressValid ? 'text-[var(--green)]' : 'text-[var(--amber)]'}`}>
              {health.addressValid ? health.address : 'Not set or not a valid public address'}
            </p>
          </div>
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-xs text-[var(--text-2)]">Chain provider</p>
            <p className={`mt-1 text-sm ${health.provider === 'ok' ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              {health.provider === 'ok' ? 'Reachable' : 'Not reachable'}
            </p>
          </div>
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-xs text-[var(--text-2)]">Confirmations required</p>
            <p className="mt-1 text-sm text-[var(--text-1)]">{health.confirmations}</p>
          </div>
        </div>
      ) : null}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-sm text-[var(--text-2)]">
          Status
          <select
            className="ml-2 cursor-pointer rounded-md border border-[var(--border)] bg-[var(--bg-page)] px-2 py-1.5 text-sm text-[var(--text-1)]"
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as (typeof STATUSES)[number]);
            }}
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <input
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-page)] px-3 py-1.5 text-sm text-[var(--text-1)] sm:max-w-xs"
          placeholder="Buyer, hash, or id"
          value={query}
          onChange={(event) => {
            setPage(1);
            setQuery(event.target.value);
          }}
        />
      </div>
      {error ? <p className="mb-3 text-sm text-[var(--red)]">{error}</p> : null}
      {notice ? <p className="mb-3 text-sm text-[var(--green)]">{notice}</p> : null}
      {loading ? <SkeletonTable /> : <DataTable columns={columns} rows={data?.rows ?? []} emptyMessage="No top-ups match these filters." rowKey={(row) => row.id} />}
      <div className="mt-3 flex gap-2">
        <button type="button" className="btc-btn-secondary cursor-pointer" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          Previous
        </button>
        <button type="button" className="btc-btn-secondary cursor-pointer" disabled={!data?.hasMore || loading} onClick={() => setPage((current) => current + 1)}>
          Next
        </button>
      </div>
      {active ? (
        <form
          className="mt-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <p className="text-sm text-[var(--text-1)]">
            Review {active.buyer} · {active.amount}
          </p>
          <label className="mt-3 block text-sm text-[var(--text-2)]">
            Reason
            <textarea
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text-1)]"
              required
              minLength={10}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="mt-3 block text-sm text-[var(--text-2)]">
            Transaction hash
            <input
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text-1)]"
              placeholder="Leave blank to credit the expected amount"
              value={hash}
              onChange={(event) => setHash(event.target.value)}
            />
          </label>
          <p className="mt-2 text-xs text-[var(--text-2)]">{PUBLIC_ADDRESS_NOTE}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btc-btn-primary cursor-pointer" disabled={busy} onClick={() => void review(active, 'approve')}>
              Approve
            </button>
            <button type="button" className="btc-btn-secondary cursor-pointer" disabled={busy} onClick={() => void review(active, 'reject')}>
              Reject
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
