/**
 * @file app/(dashboard)/owner/resellers/page.tsx
 *
 * Owner reseller management table with activate and suspend actions.
 *
 * @module Dashboard
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DocumentTitle } from '@/components/ui/DocumentTitle';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageError } from '@/components/ui/PageError';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatUsdt } from '@/lib/money';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import { formatRelativeTime } from '@/lib/relative-time';
import type { AccountStatus } from '@/modules/identity/types';

type ResellerRow = {
  readonly tenantId: string;
  readonly displayName: string;
  readonly email: string;
  readonly tenantName: string;
  readonly status: AccountStatus;
  readonly joinedAt: string;
  readonly walletAvailableMinor?: string;
  readonly orderCount?: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? 'R'}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

export default function OwnerResellersPage(): JSX.Element {
  const [rows, setRows] = useState<ResellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | AccountStatus>('all');
  const [sort, setSort] = useState<'newest' | 'name'>('newest');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_ROUTES.resellers}?limit=100`);
      const json = (await response.json()) as {
        success: boolean;
        data?: ResellerRow[] | { rows: ResellerRow[] };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load resellers');
        setRows([]);
        return;
      }
      setRows(Array.isArray(json.data) ? json.data : json.data.rows);
    } catch {
      setError('Unable to load resellers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatusFor(tenantId: string, next: 'active' | 'suspended', previous: AccountStatus): Promise<void> {
    setPendingId(tenantId);
    setRows((current) => current.map((row) => (row.tenantId === tenantId ? { ...row, status: next } : row)));
    try {
      const response = await fetch(API_ROUTES.resellerStatus(tenantId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setRows((current) => current.map((row) => (row.tenantId === tenantId ? { ...row, status: previous } : row)));
        toast.error(json.error?.message ?? 'Unable to update status');
        return;
      }
      toast.success(next === 'active' ? 'Reseller activated' : previous === 'pending' ? 'Reseller rejected' : 'Reseller suspended');
    } catch {
      setRows((current) => current.map((row) => (row.tenantId === tenantId ? { ...row, status: previous } : row)));
      toast.error('Unable to update status');
    } finally {
      setPendingId(null);
    }
  }

  const counts = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((row) => row.status === 'active').length,
      pending: rows.filter((row) => row.status === 'pending').length,
      suspended: rows.filter((row) => row.status === 'suspended').length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows
      .filter((row) => (status === 'all' ? true : row.status === status))
      .filter((row) =>
        needle.length === 0
          ? true
          : `${row.displayName} ${row.email} ${row.tenantName}`.toLowerCase().includes(needle),
      )
      .sort((left, right) =>
        sort === 'name'
          ? left.displayName.localeCompare(right.displayName)
          : new Date(right.joinedAt).getTime() - new Date(left.joinedAt).getTime(),
      );
  }, [rows, search, sort, status]);

  return (
    <>
      <DocumentTitle title="Resellers — Black Tier Circle" />
      <PageHeader
        title="Resellers"
        description="Invite, activate, and suspend reseller tenants"
        actions={
          <Link href={ROUTES.owner.resellersInvite} className="btc-btn-primary">
            + Invite Reseller
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Reseller status">
        {(
          [
            ['all', `All (${counts.total})`],
            ['pending', `Pending (${counts.pending})`],
            ['active', `Active (${counts.active})`],
            ['suspended', `Suspended (${counts.suspended})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => setStatus(value)}
            className={`min-h-11 cursor-pointer rounded-full px-4 text-sm ${
              status === value
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-raised)] text-[var(--text-2)] hover:text-[var(--text-1)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search resellers…"
          className="btc-input max-w-sm"
          aria-label="Search resellers"
        />
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="btc-input w-40">
          <option value="all">Status: All</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="btc-input w-40">
          <option value="newest">Sort: Newest</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>
      {error ? <PageError message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="👤"
          title="No resellers yet"
          description="Invite your first reseller to start distributing products."
          action={{ label: 'Invite Reseller', href: ROUTES.owner.resellersInvite }}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--text-3)]">
                <th className="px-4 py-3">Reseller</th>
                <th className="px-4 py-3">Store name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Wallet</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const busy = pendingId === row.tenantId;
                return (
                  <tr key={row.tenantId} className="border-t border-[var(--border)] hover:bg-[var(--bg-raised)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white">
                          {initials(row.displayName)}
                        </span>
                        <div>
                          <p className="text-sm text-[var(--text-1)]">{row.displayName}</p>
                          <p className="text-xs text-[var(--text-3)]">{row.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{row.tenantName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {row.walletAvailableMinor ? formatUsdt(BigInt(row.walletAvailableMinor)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">{row.orderCount ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-2)]">{formatRelativeTime(row.joinedAt)}</td>
                    <td className="px-4 py-3">
                      {row.status === 'pending' ? (
                        <div className="flex gap-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setStatusFor(row.tenantId, 'active', row.status)}
                            className="min-h-11 cursor-pointer text-xs font-medium text-[var(--accent-soft)] hover:text-[var(--accent)] disabled:opacity-60"
                          >
                            Activate
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setStatusFor(row.tenantId, 'suspended', row.status)}
                            className="min-h-11 cursor-pointer text-xs font-medium text-[var(--red)] disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void setStatusFor(
                              row.tenantId,
                              row.status === 'active' ? 'suspended' : 'active',
                              row.status,
                            )
                          }
                          className="text-xs font-medium text-[var(--red)] disabled:opacity-60"
                        >
                          {row.status === 'active' ? 'Suspend' : 'Unsuspend'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
