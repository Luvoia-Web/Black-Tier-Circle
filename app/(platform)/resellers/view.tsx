'use client';

/**
 * @file app/(platform)/resellers/view.tsx
 *
 * Owner-only Resellers network dashboard matching BTC-4-resellers@2x.png:
 * network KPIs, pending approval banner, stores table with mini sparklines,
 * revenue share donut, selected store card, invite modal, and full detail drawer.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Store, TrendingUp, Users, Wallet } from 'lucide-react';
import { useSetDrawerBody } from '@/components/platform/drawer-body';
import {
  Badge,
  Button,
  Card,
  CheckboxField,
  DonutShare,
  EmptyState,
  ErrorState,
  Modal,
  RelativeTime,
  Skeleton,
  StatTile,
  StatusPill,
  TextField,
} from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES } from '@/lib/navigation';
import type {
  PendingResellerItem,
  ResellerDetailPayload,
  ResellerRange,
  ResellersNetworkPayload,
  ResellerStoreRow,
} from '@/modules/platform/resellers';

const RANGES: readonly ResellerRange[] = ['7d', '30d', '90d'];

const STATUS_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'suspended', label: 'Suspended' },
] as const;

function MiniSparkline({ values, color }: { readonly values: readonly number[]; readonly color: string }): JSX.Element {
  const pts = values.length > 0 ? values : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 72;
  const h = 24;
  const coords = pts.map((v, i) => {
    const x = pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={coords.join(' ')} />
    </svg>
  );
}

function ResellerDetailDrawer({
  detail,
  onDone,
}: {
  readonly detail: ResellerDetailPayload;
  readonly onDone: () => void;
}): JSX.Element {
  const [reason, setReason] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState('');

  const [overrideMap, setOverrideMap] = useState<Record<string, boolean>>({});
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyFeedback, setPolicyFeedback] = useState('');

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const field of detail.policy.fields) {
      if (detail.policy.override && typeof detail.policy.override[field.key] === 'boolean') {
        next[field.key] = detail.policy.override[field.key] as boolean;
      } else {
        next[field.key] = detail.policy.platformPolicy[field.key] !== false;
      }
    }
    setOverrideMap(next);
    setReason('');
    setStatusFeedback('');
    setPolicyFeedback('');
  }, [detail]);

  async function applyStatus(nextStatus: 'active' | 'suspended'): Promise<void> {
    setStatusBusy(true);
    setStatusFeedback('');
    const result = await runAction(API_ROUTES.resellerStatus(detail.id), {
      method: 'PATCH',
      body: {
        status: nextStatus,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
    });
    setStatusBusy(false);
    if (result.ok) {
      setReason('');
      setStatusFeedback(nextStatus === 'active' ? 'Reseller activated.' : 'Reseller suspended.');
      onDone();
    } else {
      setStatusFeedback(result.error.message);
    }
  }

  async function savePolicyOverride(): Promise<void> {
    setPolicyBusy(true);
    setPolicyFeedback('');
    const result = await runAction('/api/platform/settings', {
      method: 'PATCH',
      body: {
        section: 'override',
        tenantId: detail.id,
        policy: overrideMap,
      },
    });
    setPolicyBusy(false);
    if (result.ok) {
      setPolicyFeedback('Store policy override saved.');
      onDone();
    } else {
      setPolicyFeedback(result.error.message);
    }
  }

  async function resetPolicyOverride(): Promise<void> {
    setPolicyBusy(true);
    setPolicyFeedback('');
    const result = await runAction('/api/platform/settings', {
      method: 'PATCH',
      body: {
        section: 'override',
        tenantId: detail.id,
        policy: null,
      },
    });
    setPolicyBusy(false);
    if (result.ok) {
      setPolicyFeedback('Store reset to platform policy defaults.');
      onDone();
    } else {
      setPolicyFeedback(result.error.message);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-medium text-ink">{detail.name}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {detail.ownerName}
            {detail.ownerEmail ? ` · ${detail.ownerEmail}` : ''} · Joined <RelativeTime value={detail.joinedAt} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill tone={detail.status === 'active' ? 'ok' : detail.status === 'pending' ? 'warn' : 'fault'}>
            {detail.statusLabel}
          </StatusPill>
          <Badge>{detail.storeStatus === 'open' ? 'Store open' : 'Maintenance'}</Badge>
        </div>
      </div>

      {detail.latestReason ? (
        <p className="rounded-md border border-stroke bg-white/[0.03] px-3 py-2 text-xs text-ink-soft">
          Latest status note: {detail.latestReason}
        </p>
      ) : null}

      <div className="space-y-2 rounded-lg border border-stroke p-3">
        <TextField
          id="reseller-status-reason"
          label="Status or block reason"
          placeholder="Optional note for approval, suspension, or reactivation"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {statusFeedback ? <p className="text-xs text-ink-soft">{statusFeedback}</p> : null}
        <div className="flex flex-wrap gap-2">
          {detail.status === 'pending' ? (
            <Button loading={statusBusy} onClick={() => void applyStatus('active')}>
              Approve
            </Button>
          ) : detail.status === 'suspended' ? (
            <Button loading={statusBusy} onClick={() => void applyStatus('active')}>
              Reactivate
            </Button>
          ) : null}
          {detail.status !== 'suspended' ? (
            <Button variant="destructive" loading={statusBusy} onClick={() => void applyStatus('suspended')}>
              Suspend
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-stroke bg-white/[0.02] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-ink-faint">Wallet & wholesale debt</p>
            <p className="mt-0.5 font-num text-base font-medium text-ink">{detail.wallet.available} available</p>
            <p className="text-xs text-ink-soft">
              Reserved {detail.wallet.reserved} · Owes you <span className="text-ink">{detail.wallet.owesYou}</span>
            </p>
          </div>
          <Link
            href={detail.wallet.id ? `/wallets?wallet=${detail.wallet.id}` : '/wallets'}
            className="inline-flex h-9 items-center rounded-xl border border-white/12 bg-white/[0.07] px-3 text-xs font-medium text-ink hover:bg-white/10"
          >
            Wallet
          </Link>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Markup {detail.markupPercent}%{detail.supportContact ? ` · Support ${detail.supportContact}` : ''}
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Bots ({detail.bots.length})</h3>
        {detail.bots.length === 0 ? (
          <p className="text-xs text-ink-soft">No bot connected yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.bots.map((bot) => (
              <li key={bot.id} className="flex items-center justify-between gap-2 rounded-md border border-stroke px-2.5 py-2 text-xs">
                <span className="truncate font-medium text-ink">{bot.username}</span>
                <div className="flex items-center gap-2">
                  <StatusPill tone={bot.tone}>{bot.statusLabel}</StatusPill>
                  {bot.lastHealthAt ? <RelativeTime value={bot.lastHealthAt} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Products ({detail.totalProducts})</h3>
        {detail.products.length === 0 ? (
          <p className="text-xs text-ink-soft">No products listed in this store yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.products.slice(0, 8).map((prod) => (
              <li key={prod.id} className="flex items-center justify-between gap-2 rounded-md border border-stroke px-2.5 py-2 text-xs">
                <span className="truncate text-ink">{prod.title}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-num text-ink">{prod.retailPrice}</span>
                  <StatusPill tone={prod.visible ? 'ok' : 'neutral'}>{prod.visible ? 'Visible' : 'Hidden'}</StatusPill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Recent orders ({detail.totalOrders})</h3>
        {detail.orders.length === 0 ? (
          <p className="text-xs text-ink-soft">No orders yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.orders.slice(0, 8).map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-2 rounded-md border border-stroke px-2.5 py-2 text-xs">
                <div className="min-w-0">
                  <Link href={`/orders?order=${order.id}`} className="block truncate font-medium text-ink hover:underline">
                    #{order.shortId} · {order.productTitle}
                  </Link>
                  <p className="text-[11px] text-ink-faint">
                    <RelativeTime value={order.at} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-num text-ink">{order.total}</span>
                  <StatusPill tone={order.tone}>{order.status}</StatusPill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Buyers ({detail.totalCustomers})</h3>
        {detail.customers.length === 0 ? (
          <p className="text-xs text-ink-soft">No buyers yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.customers.slice(0, 8).map((cust) => (
              <li key={cust.id} className="flex items-center justify-between gap-2 rounded-md border border-stroke px-2.5 py-2 text-xs">
                <Link href={`/customers?person=${cust.id}`} className="truncate font-medium text-ink hover:underline">
                  {cust.name}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-num text-ink-soft">{cust.balance}</span>
                  <StatusPill tone={cust.state === 'Blocked' ? 'fault' : 'ok'}>{cust.state}</StatusPill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-stroke p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Policy override</h3>
          <Badge>{detail.policy.override ? 'Custom override' : 'Using default'}</Badge>
        </div>
        <div className="grid gap-1">
          {detail.policy.fields.map((field) => (
            <CheckboxField
              key={field.key}
              id={`reseller-pol-${field.key}`}
              label={field.label}
              checked={overrideMap[field.key] !== false}
              onChange={(checked) => setOverrideMap((prev) => ({ ...prev, [field.key]: checked }))}
            />
          ))}
        </div>
        {policyFeedback ? <p className="text-xs text-ink-soft">{policyFeedback}</p> : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button loading={policyBusy} onClick={() => void savePolicyOverride()}>
            Save override
          </Button>
          {detail.policy.override ? (
            <Button variant="secondary" loading={policyBusy} onClick={() => void resetPolicyOverride()}>
              Reset override
            </Button>
          ) : null}
        </div>
      </div>

      {detail.audit.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Recent activity</h3>
          <ul className="space-y-1.5">
            {detail.audit.map((entry) => (
              <li key={entry.id} className="rounded-md border border-stroke px-2.5 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{entry.action}</span>
                  <RelativeTime value={entry.at} />
                </div>
                <p className="mt-0.5 break-words text-ink-soft">{entry.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ResellersView(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const setDrawer = useSetDrawerBody();

  const range = (params.get('range') === '7d' || params.get('range') === '90d' ? params.get('range') : '30d') as ResellerRange;
  const q = params.get('q') ?? '';
  const statusFilter = params.get('status') ?? 'all';
  const resellerId = params.get('reseller') ?? '';

  const [selectedId, setSelectedId] = useState<string>('');
  const [declineId, setDeclineId] = useState<string>('');
  const [declineReason, setDeclineReason] = useState('');
  const [pendingBusyId, setPendingBusyId] = useState('');
  const [pendingFeedback, setPendingFeedback] = useState('');

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteError, setInviteError] = useState('');

  const network = useData<ResellersNetworkPayload>(
    `/api/platform/resellers?range=${encodeURIComponent(range)}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(statusFilter)}`,
  );
  const detail = useData<{ readonly detail: ResellerDetailPayload }>(
    resellerId ? `/api/platform/resellers?id=${encodeURIComponent(resellerId)}` : null,
  );

  function updateParams(changes: Record<string, string | null>): void {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `/resellers?${qs}` : '/resellers');
  }

  const { data: detailData, loading: detailLoading, error: detailError, refetch: refetchDetail } = detail;
  const { refetch: refetchNetwork } = network;

  useEffect(() => {
    if (!resellerId) {
      setDrawer(null);
      return;
    }
    const storeDetail = detailData?.detail ?? null;
    setDrawer(
      detailLoading ? (
        <p className="text-sm text-ink-soft">Loading store details…</p>
      ) : detailError ? (
        <ErrorState message={detailError.message} onRetry={refetchDetail} />
      ) : storeDetail ? (
        <ResellerDetailDrawer
          detail={storeDetail}
          onDone={() => {
            refetchDetail();
            refetchNetwork();
          }}
        />
      ) : (
        <p className="text-sm text-ink-soft">This reseller store was not found.</p>
      ),
    );
    return () => setDrawer(null);
  }, [resellerId, detailData, detailLoading, detailError, refetchDetail, refetchNetwork, setDrawer]);

  async function decidePending(item: PendingResellerItem, status: 'active' | 'suspended', reasonText?: string): Promise<void> {
    setPendingBusyId(item.id);
    setPendingFeedback('');
    const result = await runAction(API_ROUTES.resellerStatus(item.id), {
      method: 'PATCH',
      body: { status, ...(reasonText?.trim() ? { reason: reasonText.trim() } : {}) },
    });
    setPendingBusyId('');
    if (!result.ok) {
      setPendingFeedback(result.error.message);
      return;
    }
    setDeclineId('');
    setDeclineReason('');
    setPendingFeedback(status === 'active' ? `Approved ${item.name}.` : `Declined ${item.name}.`);
    refetchNetwork();
  }

  async function createInvite(): Promise<void> {
    setInviteBusy(true);
    setInviteError('');
    setInviteUrl('');
    const result = await runAction<{ readonly inviteUrl: string }>(API_ROUTES.invitationsCreate, {
      method: 'POST',
      body: { email: inviteEmail.trim() },
    });
    setInviteBusy(false);
    if (!result.ok) {
      setInviteError(result.error.message);
      return;
    }
    setInviteUrl(result.data.inviteUrl);
    setInviteEmail('');
    refetchNetwork();
  }

  if (network.loading && !network.data) {
    return (
      <section className="min-w-0 space-y-6">
        <h1 className="text-2xl font-medium text-ink">Resellers</h1>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </section>
    );
  }
  if (network.error) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-medium text-ink">Resellers</h1>
        <ErrorState message={network.error.message} onRetry={network.refetch} />
      </section>
    );
  }

  const data = network.data!;
  const stores = data.stores;
  const activeStore: ResellerStoreRow | null =
    stores.find((s) => s.id === (resellerId || selectedId)) ?? stores[0] ?? null;

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">Resellers</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {data.kpis.totalStores} stores in your network · {data.kpis.pendingStores} waiting for approval
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/settings?section=policy"
            className="inline-flex h-[38px] items-center rounded-xl border border-white/12 bg-white/[0.07] px-[15px] text-[13.5px] font-medium text-ink hover:bg-white/10"
          >
            Reseller policy
          </Link>
          <Button onClick={() => setInviteOpen(true)}>Invite reseller</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatTile
          label={`Network revenue · ${range}`}
          value={data.kpis.networkRevenue}
          icon={TrendingUp}
          tone="rose"
          delta={`${data.kpis.revenueDeltaPercent > 0 ? '+' : ''}${data.kpis.revenueDeltaPercent}%`}
          deltaTone={data.kpis.revenueDeltaPercent > 0 ? 'up' : data.kpis.revenueDeltaPercent < 0 ? 'down' : 'flat'}
        />
        <StatTile
          label="Wholesale owed to you"
          value={data.kpis.wholesaleOwed}
          icon={Wallet}
          tone="amber"
          hint={`${data.kpis.owingStoresCount} ${data.kpis.owingStoresCount === 1 ? 'store' : 'stores'}`}
        />
        <StatTile
          label="Active stores"
          value={String(data.kpis.activeStores)}
          icon={Store}
          tone="mint"
          hint={`+${data.kpis.newStoresThisMonth} this month`}
        />
        <StatTile
          label="Buyers across network"
          value={String(data.kpis.totalBuyers)}
          icon={Users}
          tone="sky"
          hint={`+${data.kpis.newBuyersInRange} in ${range}`}
        />
      </div>

      {data.pending.length > 0 ? (
        <div className="glass-card space-y-3 rounded-lg border border-amber/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-ink">
                {data.pending.length} {data.pending.length === 1 ? 'reseller is' : 'resellers are'} waiting for approval
              </p>
              <p className="text-xs text-ink-soft">Review their store name, bot, and contact before they can sell.</p>
            </div>
            {pendingFeedback ? <p className="text-xs text-ink-soft">{pendingFeedback}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.pending.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-stroke bg-white/[0.03] px-3 py-2">
                <span className="grid h-7 w-7 place-items-center rounded-pill bg-rose/20 text-xs font-medium text-ink">
                  {item.initials}
                </span>
                <button
                  type="button"
                  onClick={() => updateParams({ reseller: item.id })}
                  className="text-left text-sm font-medium text-ink hover:underline"
                >
                  {item.name}
                </button>
                <Button
                  loading={pendingBusyId === item.id}
                  onClick={() => void decidePending(item, 'active')}
                >
                  Approve
                </Button>
                {declineId === item.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      aria-label="Decline reason"
                      placeholder="Reason (optional)"
                      value={declineReason}
                      onChange={(event) => setDeclineReason(event.target.value)}
                      className="h-9 rounded-md border border-stroke bg-raised px-2.5 text-xs text-ink"
                    />
                    <Button
                      variant="destructive"
                      loading={pendingBusyId === item.id}
                      onClick={() => void decidePending(item, 'suspended', declineReason)}
                    >
                      Confirm decline
                    </Button>
                    <Button variant="ghost" onClick={() => setDeclineId('')}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDeclineId(item.id);
                      setDeclineReason('');
                    }}
                  >
                    Decline
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1fr_320px]">
        <Card
          title="Stores"
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              {RANGES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => updateParams({ range: item === '30d' ? null : item })}
                  className={`rounded-pill px-2.5 py-1 text-xs font-medium transition ${
                    range === item ? 'bg-rose text-white' : 'border border-stroke text-ink-soft hover:text-ink'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          }
        >
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <TextField
                id="resellers-search"
                label="Search stores"
                placeholder="Store name or @bot"
                value={q}
                onChange={(event) => updateParams({ q: event.target.value || null })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => updateParams({ status: chip.id === 'all' ? null : chip.id })}
                  className={`inline-flex h-9 items-center rounded-pill px-3 text-xs font-medium transition ${
                    statusFilter === chip.id ? 'bg-rose text-white' : 'border border-stroke text-ink-soft hover:text-ink'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {stores.length === 0 ? (
            <EmptyState
              title="No matching stores"
              message="Invite a reseller or clear the search filter."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-stroke text-xs text-ink-faint">
                    <th className="py-2 pr-3 font-normal">Store</th>
                    <th className="px-2 py-2 font-normal">Status</th>
                    <th className="px-2 py-2 text-right font-normal">Revenue · {range}</th>
                    <th className="px-2 py-2 text-right font-normal">Paid orders</th>
                    <th className="px-2 py-2 text-right font-normal">Buyers</th>
                    <th className="px-2 py-2 text-right font-normal">Wallet</th>
                    <th className="px-2 py-2 text-right font-normal">Owes you</th>
                    <th className="pl-2 py-2 text-right font-normal">Bot</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((store) => {
                    const selected = activeStore?.id === store.id;
                    const sparkColor =
                      store.status === 'suspended' ? '#FF5A5F' : store.botTone === 'ok' ? '#3DDC97' : '#FF4D8D';
                    return (
                      <tr
                        key={store.id}
                        onClick={() => {
                          setSelectedId(store.id);
                          updateParams({ reseller: store.id });
                        }}
                        className={`cursor-pointer border-b border-stroke/60 transition hover:bg-white/[0.04] ${
                          selected ? 'bg-rose/[0.07]' : ''
                        }`}
                      >
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/[0.08] text-xs font-medium text-ink">
                              {store.initials}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">{store.name}</p>
                              <p className="truncate text-xs text-ink-faint">{store.handle}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <StatusPill tone={store.status === 'active' ? 'ok' : store.status === 'pending' ? 'warn' : 'fault'}>
                            {store.statusLabel}
                          </StatusPill>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <MiniSparkline values={store.sparkline} color={sparkColor} />
                            <span className="font-num tabular-nums text-ink">{store.revenue}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right font-num tabular-nums text-ink">{store.orders}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right font-num tabular-nums text-ink">{store.buyers}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right font-num tabular-nums text-ink">{store.wallet}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right font-num tabular-nums">
                          <span className={BigInt(store.owesYouMinor) > 0n ? 'text-amber' : 'text-ink-soft'}>
                            {store.owesYou}
                          </span>
                        </td>
                        <td className="whitespace-nowrap pl-2 py-2.5 text-right">
                          <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                            <span
                              className={`h-1.5 w-1.5 rounded-pill ${
                                store.botTone === 'ok'
                                  ? 'bg-mint'
                                  : store.botTone === 'warn'
                                    ? 'bg-amber'
                                    : store.botTone === 'fault'
                                      ? 'bg-danger'
                                      : 'bg-white/30'
                              }`}
                            />
                            {store.botStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="min-w-0 space-y-4">
          <Card title="Share of network revenue">
            {data.revenueShare.length === 0 ? (
              <p className="text-xs text-ink-soft">No paid reseller sales in the last {range}.</p>
            ) : (
              <div className="min-w-0 space-y-2">
                <p className="text-xs text-ink-faint">Last {range}</p>
                <DonutShare slices={data.revenueShare} />
              </div>
            )}
          </Card>

          <Card title={activeStore ? activeStore.name : 'Selected store'}>
            {!activeStore ? (
              <p className="text-xs text-ink-soft">Select a reseller store to inspect its metrics.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-ink-soft">
                  {activeStore.statusLabel} · joined <RelativeTime value={activeStore.joinedAt} />
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-stroke bg-white/[0.03] p-2.5">
                    <p className="text-[11px] text-ink-faint">Margin to you</p>
                    <p className="mt-1 font-num text-base font-medium text-ink">{activeStore.marginPercent}%</p>
                  </div>
                  <div className="rounded-md border border-stroke bg-white/[0.03] p-2.5">
                    <p className="text-[11px] text-ink-faint">Avg order</p>
                    <p className="mt-1 font-num text-base font-medium text-ink">{activeStore.avgOrder}</p>
                  </div>
                  <div className="rounded-md border border-stroke bg-white/[0.03] p-2.5">
                    <p className="text-[11px] text-ink-faint">Repeat buyers</p>
                    <p className="mt-1 font-num text-base font-medium text-ink">{activeStore.repeatBuyerPercent}%</p>
                  </div>
                  <div className="rounded-md border border-stroke bg-white/[0.03] p-2.5">
                    <p className="text-[11px] text-ink-faint">Refund rate</p>
                    <p className="mt-1 font-num text-base font-medium text-ink">{activeStore.refundRatePercent}%</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => updateParams({ reseller: activeStore.id })}>
                    Inspect store
                  </Button>
                  <Link
                    href={activeStore.walletId ? `/wallets?wallet=${activeStore.walletId}` : '/wallets'}
                    className="inline-flex h-[38px] items-center rounded-xl border border-white/12 bg-white/[0.07] px-3 text-[13.5px] font-medium text-ink hover:bg-white/10"
                  >
                    Wallet
                  </Link>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal open={inviteOpen} title="Invite a reseller" onClose={() => setInviteOpen(false)}>
        <div className="space-y-4">
          <TextField
            id="invite-reseller-email"
            label="Reseller email"
            placeholder="partner@store.com"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
          />
          {inviteError ? <p className="text-xs" style={{ color: 'var(--fault-ink)' }}>{inviteError}</p> : null}
          {inviteUrl ? (
            <div className="space-y-2 rounded-md border border-mint/35 bg-mint/10 p-3 text-xs">
              <p className="font-medium text-ink">Invite link ready (expires in 7 days):</p>
              <p className="break-all text-ink-soft">{inviteUrl}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  if (navigator.clipboard) void navigator.clipboard.writeText(inviteUrl);
                }}
              >
                Copy link
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button loading={inviteBusy} disabled={!inviteEmail.trim()} onClick={() => void createInvite()}>
              Create invite
            </Button>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
          </div>
          {data.invitations.length > 0 ? (
            <div className="space-y-1.5 border-t border-stroke pt-3">
              <p className="text-xs font-medium text-ink-faint">Pending invitations ({data.invitations.length})</p>
              <ul className="space-y-1.5">
                {data.invitations.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2 text-xs text-ink-soft">
                    <span className="truncate text-ink">{inv.email}</span>
                    <span>
                      Expires <RelativeTime value={inv.expiresAt} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}
