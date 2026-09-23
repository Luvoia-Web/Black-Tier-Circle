/**
 * @file app/(dashboard)/owner/tokens/page.tsx
 *
 * Owner top-up token management: create, list, filter, and revoke.
 *
 * @module Dashboard
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DocumentTitle } from '@/components/ui/DocumentTitle';
import { PageError } from '@/components/ui/PageError';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { copyToClipboard } from '@/lib/clipboard';
import { TokenStatusBadge } from '@/components/wallet/ledger-badges';
import { formatUsdt, usdtToMinor } from '@/lib/money';
import { API_ROUTES } from '@/lib/navigation';
import { ValidationError } from '@/lib/errors';
import type { TokenStatus } from '@/modules/wallet/types';

type TokenRow = {
  readonly id: string;
  readonly token: string;
  readonly amountUsdt: string;
  readonly status: TokenStatus;
  readonly tenantId: string | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
};

type ResellerOption = {
  readonly tenantId: string;
  readonly displayName: string;
  readonly tenantName: string;
  readonly status: string;
};

const TABS: ReadonlyArray<{ id: 'all' | TokenStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'redeemed', label: 'Redeemed' },
  { id: 'expired', label: 'Expired' },
  { id: 'revoked', label: 'Revoked' },
];

function minorPreview(amountStr: string): string | null {
  try {
    return usdtToMinor(amountStr).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return null;
    }
    return null;
  }
}

/**
 * Owner token management page.
 */
export default function OwnerTokensPage(): JSX.Element {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [resellers, setResellers] = useState<ResellerOption[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('50.00');
  const [tenantId, setTenantId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const url =
        tab === 'all' ? API_ROUTES.adminTokens : `${API_ROUTES.adminTokens}?status=${encodeURIComponent(tab)}`;
      const [tokenRes, resellerRes] = await Promise.all([fetch(url), fetch(`${API_ROUTES.resellers}?limit=100`)]);
      const json = (await tokenRes.json()) as {
        success: boolean;
        data?: TokenRow[];
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load tokens');
        setRows([]);
        return;
      }
      setRows(json.data);
      const resellerJson = (await resellerRes.json()) as {
        success: boolean;
        data?: ResellerOption[] | { rows: ResellerOption[] };
      };
      if (resellerJson.success && resellerJson.data) {
        const list = Array.isArray(resellerJson.data) ? resellerJson.data : resellerJson.data.rows;
        setResellers(list.filter((row) => row.status === 'active'));
      }
    } catch {
      setError('Unable to load tokens');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const preview = useMemo(() => minorPreview(amount), [amount]);

  async function createToken(): Promise<void> {
    setCreating(true);
    setError(null);
    setRevealedToken(null);
    try {
      const response = await fetch(API_ROUTES.adminTokens, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountUsdtStr: amount,
          ...(tenantId ? { tenantId } : {}),
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        }),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: { token: string };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to create token');
        return;
      }
      setRevealedToken(json.data.token);
      toast.success('Token generated — copy it now');
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(tokenId: string): Promise<void> {
    if (!window.confirm('Revoke this token? It can no longer be redeemed.')) {
      return;
    }
    setPendingId(tokenId);
    try {
      const response = await fetch(API_ROUTES.adminTokenRevoke(tokenId), { method: 'POST' });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to revoke token');
        return;
      }
      await load();
    } finally {
      setPendingId(null);
    }
  }

  const columns: ReadonlyArray<DataTableColumn<TokenRow>> = [
    { key: 'token', header: 'Token', render: (row) => <span className="font-mono">{row.token}</span> },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => formatUsdt(BigInt(row.amountUsdt)),
    },
    {
      key: 'assigned',
      header: 'Assigned To',
      render: (row) => {
        if (!row.tenantId) {
          return 'Any reseller';
        }
        const match = resellers.find((item) => item.tenantId === row.tenantId);
        return match?.tenantName ?? row.tenantId.slice(0, 8);
      },
    },
    { key: 'status', header: 'Status', render: (row) => <TokenStatusBadge status={row.status} /> },
    {
      key: 'created',
      header: 'Created',
      render: (row) => new Date(row.createdAt).toLocaleString(),
    },
    {
      key: 'expires',
      header: 'Expires',
      render: (row) => (row.expiresAt ? new Date(row.expiresAt).toLocaleString() : 'Never'),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) =>
        row.status === 'active' ? (
          <button
            type="button"
            disabled={pendingId === row.id}
            onClick={() => void revoke(row.id)}
            className="text-sm text-[var(--red)] hover:text-red-300 disabled:opacity-50"
          >
            Revoke
          </button>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <>
      <DocumentTitle title="Deposit Tokens — Black Tier Circle" />
      <PageHeader
        title="Deposit Tokens"
        description="Generate one-use 12-digit tokens to credit reseller wallets"
      />

      <section className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm text-[var(--text-2)]">
              Amount (USDT)
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-[var(--text-1)]"
              />
              <span className="mt-1 block text-xs text-[var(--text-3)]">
                {preview ? `= ${preview} minor units` : 'Enter a valid USDT amount'}
              </span>
            </label>
            <label className="text-sm text-[var(--text-2)]">
              Assign to reseller
              <select
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-[var(--text-1)]"
              >
                <option value="">Any reseller</option>
                {resellers.map((reseller) => (
                  <option key={reseller.tenantId} value={reseller.tenantId}>
                    {reseller.displayName} ({reseller.tenantName})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-[var(--text-2)]">
              Expires
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-[var(--text-1)]"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={creating}
            onClick={() => void createToken()}
            className="mt-4 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Generate token'}
          </button>
          {revealedToken ? (
            <div className="mt-4 rounded-md border border-amber-600/40 bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-amber-300">This token will only be shown once. Copy it now.</p>
              <p className="mt-2 font-mono text-lg tracking-widest text-[var(--text-1)]">{revealedToken}</p>
              <button
                type="button"
                className="mt-2 text-sm text-[var(--accent-soft)] hover:text-[var(--accent)]"
                onClick={() => {
                  void copyToClipboard(revealedToken).then((ok) => {
                    toast[ok ? 'success' : 'error'](ok ? 'Copied' : 'Copy failed');
                  });
                }}
              >
                Copy token
              </button>
            </div>
          ) : null}
        </section>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full px-3 py-1 text-sm ${
              tab === item.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-raised)] text-[var(--text-2)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <PageError message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <SkeletonTable />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyMessage={`No ${tab === 'all' ? '' : `${tab} `}tokens yet`}
        />
      )}
    </>
  );
}
