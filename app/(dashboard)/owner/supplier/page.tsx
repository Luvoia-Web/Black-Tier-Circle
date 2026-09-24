/**
 * @file app/(dashboard)/owner/supplier/page.tsx
 *
 * Connected supplier accounts and a link back to the fulfillment queue.
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { API_ROUTES, ROUTES } from '@/lib/navigation';

type SupplierCard = {
  readonly supplierId: string;
  readonly supplierName: string;
  readonly baseUrl: string;
  readonly status: string;
  readonly balance: string;
  readonly membership: string | null;
  readonly lastSyncAt: string | null;
  readonly productCount: number;
  readonly hasApiKey: boolean;
};

function ago(value: string | null): string {
  if (!value) {
    return 'Never';
  }
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }
  return `${Math.round(minutes / 60)} hours ago`;
}

export default function OwnerSuppliersPage(): JSX.Element {
  const [rows, setRows] = useState<SupplierCard[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(API_ROUTES.supplierBalance);
      const json = (await response.json()) as {
        success: boolean;
        data?: { balances: SupplierCard[]; pendingReviewCount: number };
      };
      if (json.success && json.data) {
        setRows(json.data.balances);
        setPending(json.data.pendingReviewCount);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sync(supplierId: string): Promise<void> {
    setBusy(supplierId);
    try {
      const response = await fetch(API_ROUTES.supplierSync, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId }),
      });
      const json = (await response.json()) as { success: boolean; data?: { results: Array<{ synced: number; newProducts: number }> } };
      if (!json.success) {
        toast.error('Sync failed');
        return;
      }
      const summary = json.data?.results[0];
      toast.success(summary ? `Synced ${summary.synced} products (${summary.newProducts} new)` : 'Sync finished');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function balance(supplierId: string): Promise<void> {
    setBusy(supplierId);
    try {
      await fetch(`${API_ROUTES.supplierBalance}?refresh=${supplierId}`);
      toast.success('Balance updated');
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={pending > 0 ? `${pending} products waiting for review` : 'Import products from a supplier API'}
        actions={
          <Link href={ROUTES.owner.supplierConnect} className="btc-btn-primary">
            + Connect Supplier
          </Link>
        }
      />
      <p className="mb-4 text-sm">
        <Link href={ROUTES.owner.supplierOrders} className="text-[var(--accent)] hover:underline">
          Open fulfillment queue
        </Link>
      </p>
      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard className="h-48" />
          <SkeletonCard className="h-48" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
          <p className="text-lg font-medium">No suppliers connected yet</p>
          <p className="mt-2 text-sm text-[var(--text-2)]">Connect a supplier API to import products into your catalog.</p>
          <Link href={ROUTES.owner.supplierConnect} className="btc-btn-primary mt-4 inline-flex">
            + Connect Supplier
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((row) => (
            <article key={row.supplierId} className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium">{row.supplierName}</h2>
                  <p className="text-sm text-[var(--text-2)]">{row.baseUrl}</p>
                </div>
                <span className={row.status === 'active' ? 'text-[var(--green)]' : 'text-[var(--text-3)]'}>● {row.status}</span>
              </div>
              <p className="mt-4 text-sm">
                Balance: {row.balance} USDT | Membership: {row.membership ?? '—'}
              </p>
              <p className="mt-1 text-sm text-[var(--text-2)]">
                Products: {row.productCount} synced | Last sync: {ago(row.lastSyncAt)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={ROUTES.owner.supplierDetail(row.supplierId)} className="btc-btn-primary">
                  View Products
                </Link>
                <button type="button" className="btc-btn-secondary" disabled={busy === row.supplierId} onClick={() => void sync(row.supplierId)}>
                  Sync Now
                </button>
                <button type="button" className="btc-btn-secondary" disabled={busy === row.supplierId} onClick={() => void balance(row.supplierId)}>
                  Check Balance
                </button>
                <Link href={ROUTES.owner.supplierSettings(row.supplierId)} className="btc-btn-secondary">
                  Settings
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
