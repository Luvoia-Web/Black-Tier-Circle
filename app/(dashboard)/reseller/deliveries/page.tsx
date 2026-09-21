/**
 * @file app/(dashboard)/reseller/deliveries/page.tsx
 *
 * Manual delivery queue for the reseller.
 *
 * @module Dashboard
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ErrorState, TableSkeleton } from '@/components/ui/fetch-states';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES } from '@/lib/navigation';

type Row = {
  readonly orderId: string;
  readonly customerLabel: string;
  readonly productTitle: string;
  readonly amount: string;
  readonly waitingMs: number;
  readonly status: 'pending' | 'completed' | 'failed';
};

function formatWait(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function playBeep(): void {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 880;
  gain.gain.value = 0.05;
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

export default function ResellerDeliveriesPage(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('pending');
  const [report, setReport] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sound, setSound] = useState(false);
  const [content, setContent] = useState<Record<string, string>>({});
  const seen = useRef<Set<string>>(new Set());

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const params = new URLSearchParams({ q, status, report, from, to });
      const response = await fetch(`${API_ROUTES.resellerDeliveries}?${params.toString()}`);
      const json = (await response.json()) as {
        success: boolean;
        data?: { rows: Row[] };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load deliveries');
        return;
      }
      const next = json.data.rows;
      const pendingIds = next.filter((row) => row.status === 'pending').map((row) => row.orderId);
      if (sound && seen.current.size > 0) {
        const fresh = pendingIds.some((id) => !seen.current.has(id));
        if (fresh) {
          playBeep();
        }
      }
      seen.current = new Set(pendingIds);
      setRows(next);
    } catch {
      setError('Unable to load deliveries');
    } finally {
      setLoading(false);
    }
  }, [q, status, report, from, to, sound]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function deliver(orderId: string): Promise<void> {
    const body = content[orderId] ?? '';
    const response = await fetch(API_ROUTES.resellerDeliver(orderId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: body }),
    });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      setError(json.error?.message ?? 'Unable to deliver');
      return;
    }
    await load();
  }

  const columns: ReadonlyArray<DataTableColumn<Row>> = [
    { key: 'order', header: 'Order', render: (row) => row.orderId.slice(0, 8).toUpperCase() },
    { key: 'customer', header: 'Customer', render: (row) => row.customerLabel },
    { key: 'product', header: 'Product', render: (row) => row.productTitle },
    { key: 'amount', header: 'Amount', render: (row) => row.amount },
    { key: 'wait', header: 'Waiting', render: (row) => formatWait(row.waitingMs) },
    {
      key: 'action',
      header: 'Action',
      render: (row) =>
        row.status === 'pending' ? (
          <div className="flex min-w-[16rem] gap-2">
            <input
              value={content[row.orderId] ?? ''}
              onChange={(event) => setContent((current) => ({ ...current, [row.orderId]: event.target.value }))}
              placeholder="License key or link"
              className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => void deliver(row.orderId)}
              className="rounded-md bg-[var(--accent)] px-2 py-1 text-xs text-white"
            >
              Deliver
            </button>
          </div>
        ) : (
          <span className="text-xs text-[var(--text-2)]">{row.status}</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Deliveries"
        description="Manual delivery queue"
        actions={
          <button
            type="button"
            onClick={() => setSound((value) => !value)}
            className="rounded-md border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-1)]"
          >
            {sound ? '🔔 Sound on' : '🔕 Sound off'}
          </button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search product or details"
          className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
        />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm">
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        <select value={report} onChange={(event) => setReport(event.target.value)} className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm">
          <option value="all">All reports</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="week">This week</option>
        </select>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm" />
      </div>
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 && status === 'pending' ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center text-[var(--text-2)]">
          🎉 No pending deliveries
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.orderId} emptyMessage="🎉 No pending deliveries" />
      )}
    </>
  );
}
