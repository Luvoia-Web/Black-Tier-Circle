/**
 * @file app/(dashboard)/owner/bots/page.tsx
 *
 * Owner overview of the store bot and all connected reseller bots.
 *
 * @module Dashboard
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES } from '@/lib/navigation';

type BotRow = {
  readonly id: string;
  readonly reseller: string;
  readonly tenantName: string;
  readonly username: string;
  readonly status: 'connected' | 'disconnected' | 'error';
  readonly lastHealthAt: string | null;
  readonly customerCount: number;
  readonly connectedSince: string;
};

function statusClass(status: BotRow['status']): string {
  if (status === 'connected') {
    return 'bg-emerald-500/10 text-emerald-400';
  }
  if (status === 'error') {
    return 'bg-red-500/10 text-red-400';
  }
  return 'bg-gray-500/10 text-gray-400';
}

/**
 * Lists connected reseller bots and owner store bot configuration.
 */
export default function OwnerBotsPage(): JSX.Element {
  const [rows, setRows] = useState<BotRow[]>([]);
  const [ownerConfigured, setOwnerConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.adminBots);
      const json = (await response.json()) as {
        success: boolean;
        data?: { ownerBotConfigured: boolean; bots: BotRow[] };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load bots');
        setRows([]);
        return;
      }
      setOwnerConfigured(json.data.ownerBotConfigured);
      setRows(json.data.bots);
    } catch {
      setError('Unable to load bots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ReadonlyArray<DataTableColumn<BotRow>> = [
    { key: 'reseller', header: 'Reseller', render: (row) => row.reseller },
    { key: 'username', header: 'Bot Username', render: (row) => `@${row.username}` },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusClass(row.status)}`}>
          {row.status}
        </span>
      ),
    },
    {
      key: 'health',
      header: 'Last Health',
      render: (row) => (row.lastHealthAt ? new Date(row.lastHealthAt).toLocaleString() : '—'),
    },
    { key: 'customers', header: 'Customers', render: (row) => String(row.customerCount) },
    {
      key: 'since',
      header: 'Connected Since',
      render: (row) => new Date(row.connectedSince).toLocaleDateString(),
    },
  ];

  return (
    <>
      <PageHeader title="Bots" description="Owner store bot and connected reseller bots" />
      <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400">Owner store bot</h2>
        <p className="mt-2 text-lg font-semibold text-gray-100">
          {ownerConfigured ? 'Configured via environment' : 'Not configured'}
        </p>
        <p className="mt-1 text-sm text-gray-400">
          {ownerConfigured
            ? 'The owner bot uses OWNER_BOT_TOKEN and the same customer UX as reseller bots, without a reseller wallet.'
            : 'Set OWNER_BOT_TOKEN and OWNER_BOT_WEBHOOK_SECRET to enable the owner store bot.'}
        </p>
      </section>
      {error ? (
        <p className="mb-4 rounded-md border border-red-600/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-400">Loading bots…</p>
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} emptyMessage="No reseller bots connected." />
      )}
    </>
  );
}
