/**
 * @file app/(dashboard)/owner/resellers/page.tsx
 *
 * Owner reseller management table with activate and suspend actions.
 *
 * @module Dashboard
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { AccountStatus } from '@/modules/identity/types';

type ResellerRow = {
  readonly tenantId: string;
  readonly displayName: string;
  readonly email: string;
  readonly tenantName: string;
  readonly status: AccountStatus;
  readonly joinedAt: string;
};

/**
 * Lists resellers and lets the owner change tenant status.
 */
export default function OwnerResellersPage(): JSX.Element {
  const [rows, setRows] = useState<ResellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.resellers);
      const json = (await response.json()) as { success: boolean; data?: ResellerRow[]; error?: { message: string } };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load resellers');
        setRows([]);
        return;
      }
      setRows(json.data);
    } catch {
      setError('Unable to load resellers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(tenantId: string, status: 'active' | 'suspended'): Promise<void> {
    setPendingId(tenantId);
    try {
      const response = await fetch(API_ROUTES.resellerStatus(tenantId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to update status');
        return;
      }
      await load();
    } finally {
      setPendingId(null);
    }
  }

  const columns: ReadonlyArray<DataTableColumn<ResellerRow>> = [
    { key: 'name', header: 'Display name', render: (row) => row.displayName },
    { key: 'email', header: 'Email', render: (row) => row.email || '—' },
    { key: 'tenant', header: 'Tenant', render: (row) => row.tenantName },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'joined',
      header: 'Joined',
      render: (row) => new Date(row.joinedAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => {
        const busy = pendingId === row.tenantId;
        if (row.status === 'pending') {
          return (
            <button
              type="button"
              disabled={busy}
              onClick={() => void setStatus(row.tenantId, 'active')}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
            >
              {busy ? 'Updating…' : 'Activate'}
            </button>
          );
        }
        const next = row.status === 'active' ? 'suspended' : 'active';
        const label = row.status === 'active' ? 'Suspend' : 'Unsuspend';
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setStatus(row.tenantId, next)}
            className="rounded-md border border-red-600/30 bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
          >
            {busy ? 'Updating…' : label}
          </button>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Resellers"
        description="Invite, activate, and suspend reseller tenants"
        actions={
          <Link
            href={ROUTES.owner.resellersInvite}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Invite Reseller
          </Link>
        }
      />
      {error ? (
        <p className="mb-4 rounded-md border border-red-600/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-400">Loading resellers…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.tenantId}
          emptyMessage="No resellers yet. Invite your first reseller."
        />
      )}
    </>
  );
}
