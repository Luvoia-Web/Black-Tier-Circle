'use client';

/**
 * Orders, as in the reference: tiles, chips, a dense table, and the drawer.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Calendar, Coins, Download, RefreshCw, ShoppingBag, Store, Zap } from 'lucide-react';
import { useSetDrawerBody } from '@/components/platform/drawer-body';
import { Button, DataTable, ErrorState, Pagination, RelativeTime, SelectField, Skeleton, StatTile, StatusPill, TextAreaField, TextField, type Column } from '@/components/platform/ui';
import { displayOrderEventNote } from '@/lib/display-labels';
import { orderCanRetry, orderDisplayStatus } from '@/lib/order-state';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { OrderChip, OrderListRow, OrderSummary } from '@/modules/platform/orders';

type PagePayload = {
  readonly rows: readonly OrderListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly viewer: 'owner' | 'reseller';
  readonly summary: OrderSummary;
};

type DetailPayload = {
  readonly order: {
    readonly id: string;
    readonly quantity: number;
    readonly paymentStatus: string;
    readonly fulfillmentStatus: string;
    readonly deliveryStatus: string;
    readonly externalOrderRef: string | null;
    readonly quotedRetailPrice: string;
    readonly channelLabel: string;
    readonly createdAt: string;
  };
  readonly product: { readonly title: string; readonly sku: string; readonly supplierSku: string | null; readonly sourceLabel: string };
  readonly customer: { readonly username: string | null; readonly firstName: string | null; readonly orderCount: number; readonly balance: string } | null;
  readonly paymentClaim: { readonly binanceOrderId: string | null; readonly txHash: string | null; readonly submittedAt: string; readonly verifiedAt: string | null; readonly rejectReason: string | null } | null;
  readonly fulfillmentAttempt: { readonly method: string; readonly status: string; readonly error: string | null } | null;
  readonly events: readonly { readonly label: string; readonly at: string; readonly tone: 'ok' | 'fault' | 'neutral'; readonly note: string | null }[];
  readonly replacementOpen: boolean;
  readonly canReplaceFromSupplier?: boolean;
};

const CHIPS: readonly { readonly id: OrderChip; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'awaiting', label: 'Awaiting payment' },
  { id: 'fulfilling', label: 'Fulfilling' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'failed', label: 'Failed' },
  { id: 'expired', label: 'Expired' },
];

function money(minor: string): string {
  try {
    const whole = Number(BigInt(minor)) / 1_000_000;
    return `${whole.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  } catch {
    return '0.00 USDT';
  }
}

const TILES = [
  'linear-gradient(145deg,#ffe3ec,#ffc2d4)',
  'linear-gradient(145deg,#e6efff,#c3d6ff)',
  'linear-gradient(145deg,#fff3cf,#ffe29a)',
  'linear-gradient(145deg,#e4fbef,#bdf0d6)',
  'linear-gradient(145deg,#efe6ff,#d6c4ff)',
  'linear-gradient(145deg,#ffe1e1,#ffbdbd)',
];

function initials(title: string): string {
  const parts = title.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : (parts[0] ?? 'PR').slice(0, 2);
  return letters.toUpperCase();
}

function tile(title: string): string {
  let hash = 0;
  for (let index = 0; index < title.length; index += 1) hash = (hash + title.charCodeAt(index)) % TILES.length;
  return TILES[hash] ?? 'linear-gradient(145deg,#ffe3ec,#ffc2d4)';
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function minorBigInt(raw: string): bigint {
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

function isWithinLast7Days(createdAt: string): boolean {
  const ts = Date.parse(createdAt);
  return Number.isFinite(ts) && Date.now() - ts <= SEVEN_DAYS_MS;
}

function TrackDot({ on, fault, active = false }: { readonly on: boolean; readonly fault: boolean; readonly active?: boolean }): JSX.Element {
  const color = fault
    ? 'bg-danger shadow-[0_0_0_3px_rgba(255,90,95,0.22)]'
    : active
      ? 'bg-sky shadow-[0_0_0_3px_rgba(126,166,239,0.22)]'
      : on
        ? 'bg-mint'
        : 'bg-white/15';
  return <span className={`h-[9px] w-[9px] rounded-full ${color}`} />;
}

export function OrdersView(): JSX.Element {
  const params = useSearchParams();
  const router = useRouter();
  const setDrawer = useSetDrawerBody();
  const query = params.toString();
  const list = useData<PagePayload>(`/api/platform/orders${query ? `?${query}` : ''}`);
  const orderId = params.get('order');
  const detail = useData<DetailPayload>(orderId ? API_ROUTES.orderDetail(orderId) : null);
  const { data: detailData, loading: detailLoading, error: detailError, refetch: refetchDetail } = detail;
  const { refetch: refetchList } = list;
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [includeOlderRetry, setIncludeOlderRetry] = useState(false);
  const viewer = list.data?.viewer ?? 'owner';
  const attention = params.get('attention');

  useEffect(() => {
    if (!orderId) {
      setDrawer(null);
      return;
    }
    setDrawer(
      detailLoading ? <Skeleton className="h-40 w-full" />
        : detailError ? <ErrorState message={detailError.message} onRetry={refetchDetail} />
          : detailData ? (
            <OrderDrawer
              detail={detailData}
              viewer={viewer}
              deliveryQueue={attention === 'delivery'}
              onDone={() => {
                refetchDetail();
                refetchList();
              }}
            />
          ) : <p className="text-sm text-ink">This order was not found.</p>,
    );
    return () => setDrawer(null);
  }, [orderId, detailData, detailLoading, detailError, refetchDetail, refetchList, setDrawer, viewer, attention]);

  function setFilter(key: string, value: string): void {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page' && key !== 'order') next.delete('page');
    if (key === 'chip') next.delete('attention');
    const valueText = next.toString();
    router.replace(valueText ? `${ROUTES.platform.orders}?${valueText}` : ROUTES.platform.orders, { scroll: false });
  }

  const allRetryableRows = (list.data?.rows ?? []).filter((row) =>
    orderCanRetry({
      paymentStatus: row.paymentStatus,
      fulfillmentStatus: row.fulfillmentStatus,
      deliveryStatus: row.deliveryStatus,
    }),
  );
  const baseRetryCandidates = selected.size > 0
    ? allRetryableRows.filter((row) => selected.has(row.id))
    : allRetryableRows;
  const recentRetryCandidates = baseRetryCandidates.filter((row) => isWithinLast7Days(row.createdAt));
  const olderRetryCandidates = baseRetryCandidates.filter((row) => !isWithinLast7Days(row.createdAt));
  const activeRetryCandidates = includeOlderRetry ? baseRetryCandidates : recentRetryCandidates;
  const retryTotalCostMinor = activeRetryCandidates.reduce((sum, row) => sum + minorBigInt(row.supplierCostMinor), 0n);

  function openRetryConfirm(): void {
    setIncludeOlderRetry(false);
    setRetryConfirmOpen(true);
  }

  async function runBulk(kind: 'retry' | 'cancel'): Promise<void> {
    const ids = kind === 'retry'
      ? activeRetryCandidates.map((row) => row.id).slice(0, 25)
      : [...selected].slice(0, 25);
    if (ids.length === 0) {
      setRetryConfirmOpen(false);
      return;
    }
    setBusy(true);
    const results: string[] = [];
    for (const id of ids) {
      const row = list.data?.rows.find((item) => item.id === id);
      if (
        kind === 'retry' &&
        row &&
        !orderCanRetry({
          paymentStatus: row.paymentStatus,
          fulfillmentStatus: row.fulfillmentStatus,
          deliveryStatus: row.deliveryStatus,
        })
      ) {
        results.push(`${id.slice(0, 8)} skipped`);
        continue;
      }
      const result = kind === 'retry'
        ? await runAction(API_ROUTES.fulfillmentRetryDelivery(id))
        : await runAction(API_ROUTES.orderCancel(id), { body: { reason: 'Cancelled from the orders list' } });
      results.push(result.ok ? `${id.slice(0, 8)} ${kind === 'retry' ? 'retried' : 'cancelled'}` : `${id.slice(0, 8)} failed: ${result.error.message}`);
    }
    setBusy(false);
    setRetryConfirmOpen(false);
    setNotice(results.join(' · '));
    setSelected(new Set());
    list.refetch();
  }

  const columns: Column<OrderListRow>[] = [
    {
      id: 'id',
      header: 'Order',
      render: (row) => (
        <span className="block">
          <span className="font-mono text-[13px] text-ink">{row.id.slice(0, 8).toUpperCase()}</span>
          <span className="mt-0.5 block text-xs"><RelativeTime value={row.createdAt} /></span>
        </span>
      ),
    },
    {
      id: 'product',
      header: 'Product',
      render: (row) => (
        <span className="flex items-center gap-2">
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-md text-[11px] font-medium text-[#5a2038]" style={{ background: tile(row.productTitle) }}>{initials(row.productTitle)}</span>
          <span>
            <span className="block text-ink">{row.productTitle}</span>
            <span className="block text-xs text-ink-faint">× {row.quantity}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'buyer',
      header: 'Buyer',
      render: (row) => (
        <span className="block">
          <span className="block text-ink">{row.customerLabel}</span>
          <span className="block text-xs text-ink-faint">{row.storeLabel}</span>
        </span>
      ),
    },
    {
      id: 'timeline',
      header: 'Paid · Supplier · Delivered',
      render: (row) => {
        const paid = row.paymentStatus === 'verified' || row.paymentStatus === 'not_required';
        const supplier = row.fulfillmentStatus === 'ready' || row.deliveryStatus === 'sent';
        const delivered = row.deliveryStatus === 'sent';
        const supplierFault = row.fulfillmentStatus === 'failed';
        const status = orderDisplayStatus(row);
        const activating = row.fulfillmentStatus === 'supplier_pending' || row.fulfillmentStatus === 'processing';
        return (
          <span className="flex items-center gap-2">
            <span className="flex items-center" aria-hidden="true">
              <TrackDot on={paid} fault={row.paymentStatus === 'failed'} />
              <span className="mx-0.5 h-px w-2.5 bg-white/15" />
              <TrackDot on={supplier} fault={supplierFault} active={activating} />
              <span className="mx-0.5 h-px w-4 bg-white/15" />
              <TrackDot on={delivered} fault={row.deliveryStatus === 'unreachable'} />
            </span>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </span>
        );
      },
    },
    { id: 'total', header: 'Total', numeric: true, render: (row) => row.total },
  ];

  const summary = list.data?.summary;
  const exportHref = `/api/platform/orders?${new URLSearchParams({ ...Object.fromEntries(params.entries()), format: 'csv' }).toString()}`;
  const activeChip = attention ? 'attention' : (params.get('chip') as OrderChip | null) ?? 'all';
  const showHeaderRetry = viewer === 'owner' && activeChip === 'attention';
  const failedCount = summary?.chips.failed ?? 0;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-medium tracking-tight text-ink">Orders</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-soft">
            Payment, supplier and delivery on one timeline
            {summary ? <> · <b className="font-medium text-ink">{summary.needsAttention}</b> need attention</> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex h-[38px] items-center gap-2 rounded-xl border border-white/12 bg-white/[0.07] px-[15px] text-[13.5px] font-medium text-ink hover:bg-white/10" href={exportHref}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export CSV
          </a>
          {showHeaderRetry ? (
            <Button loading={busy} onClick={openRetryConfirm}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry failed ({failedCount})
            </Button>
          ) : null}
        </div>
      </header>
      {retryConfirmOpen ? (
        <div className="glass-card space-y-3 rounded-lg border border-amber/30 p-4" role="dialog" aria-label="Confirm retry failed orders">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium text-ink">Review retry ({activeRetryCandidates.length} {activeRetryCandidates.length === 1 ? 'order' : 'orders'})</h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Total estimated supplier cost: <strong className="font-num text-ink">{money(retryTotalCostMinor.toString())}</strong>
              </p>
            </div>
            {olderRetryCandidates.length > 0 ? (
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <input type="checkbox" checked={includeOlderRetry} onChange={(event) => setIncludeOlderRetry(event.target.checked)} />
                Include orders older than 7 days ({olderRetryCandidates.length} excluded by default)
              </label>
            ) : null}
          </div>
          {activeRetryCandidates.length === 0 ? (
            <p className="text-sm text-ink-soft">
              {olderRetryCandidates.length > 0
                ? 'All retryable failed orders on this page are older than 7 days. Enable the option above if you still want to retry them.'
                : 'No retryable failed orders match right now.'}
            </p>
          ) : (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
              {activeRetryCandidates.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-black/25 px-3 py-1.5">
                  <span className="font-mono text-ink">{row.id.slice(0, 8).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-soft">{row.productTitle} · {row.customerLabel}</span>
                  <span className="text-ink-faint"><RelativeTime value={row.createdAt} /></span>
                  <span className="font-num text-ink">{money(row.supplierCostMinor)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setRetryConfirmOpen(false)}>Cancel</Button>
            <Button loading={busy} disabled={activeRetryCandidates.length === 0} onClick={() => void runBulk('retry')}>
              Confirm retry ({activeRetryCandidates.length})
            </Button>
          </div>
        </div>
      ) : null}
      {summary ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          <StatTile label="Orders today" value={String(summary.ordersToday)} icon={ShoppingBag} tone="rose" />
          <StatTile label="Revenue today" value={money(summary.revenueTodayMinor)} icon={Coins} tone="sky" />
          <StatTile label="Needs attention" value={String(summary.needsAttention)} icon={AlertTriangle} tone="danger" />
          <StatTile label="Median delivery" value={summary.medianDeliverySeconds === null ? '—' : `${summary.medianDeliverySeconds} sec`} icon={Zap} tone="mint" />
        </div>
      ) : list.loading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((chip) => {
          const count = summary?.chips[chip.id];
          const on = activeChip === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={on}
              className={`inline-flex h-[30px] items-center gap-2 rounded-xl border px-3 text-[12.5px] ${on ? 'border-white/15 bg-white/[0.13] text-white' : 'border-white/10 bg-white/[0.04] text-ink-soft'}`}
              onClick={() => setFilter('chip', chip.id === 'all' ? '' : chip.id)}
            >
              {chip.label}
              {typeof count === 'number' ? <span className={`rounded-pill px-1.5 text-[11px] ${chip.id === 'attention' ? 'bg-danger/20 text-[#ffb4b6]' : 'bg-white/10 text-ink-soft'}`}>{count}</span> : null}
            </button>
          );
        })}
        <div className="ml-auto flex flex-wrap items-center gap-2 [&_label]:sr-only [&_select]:h-8 [&_select]:min-h-8 [&_select]:rounded-xl [&_select]:border-white/10 [&_select]:bg-white/[0.04] [&_input]:h-8 [&_input]:min-h-8 [&_input]:w-44 [&_input]:rounded-xl">
          <span className="inline-flex items-center gap-1 text-ink-soft"><Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            <SelectField
              id="order-range"
              label="Dates"
              value={params.get('range') ?? 'all'}
              options={[
                { value: 'all', label: 'All dates' },
                { value: 'today', label: 'Today' },
                { value: '7d', label: 'Last 7 days' },
                { value: '30d', label: 'Last 30 days' },
              ]}
              onChange={(event) => setFilter('range', event.target.value === 'all' ? '' : event.target.value)}
            />
          </span>
          {viewer === 'owner' ? (
            <span className="inline-flex items-center gap-1 text-ink-soft"><Store className="h-3.5 w-3.5" aria-hidden="true" />
              <SelectField
                id="order-store"
                label="Store"
                value={params.get('store') ?? ''}
                options={[{ value: '', label: 'All stores' }, ...(summary?.stores ?? []).map((store) => ({ value: store.id, label: store.label }))]}
                onChange={(event) => setFilter('store', event.target.value)}
              />
            </span>
          ) : null}
          <TextField id="order-search" label="Search" placeholder="Order, buyer, or product" defaultValue={params.get('q') ?? ''} onBlur={(event) => setFilter('q', event.target.value)} />
        </div>
      </div>
      {attention === 'fulfillment' ? <p className="text-sm text-ink">Showing the failed and stuck fulfillment queue.</p> : null}
      {attention === 'delivery' ? <p className="text-sm text-ink">Showing the manual delivery queue.</p> : null}
      {notice ? <p className="text-sm text-ink">{notice}</p> : null}
      <DataTable
        caption="Orders"
        columns={columns}
        rows={list.data?.rows ?? []}
        rowKey={(row) => row.id}
        loading={list.loading && !list.data}
        error={list.data ? null : list.error?.message ?? null}
        onRetry={list.refetch}
        emptyTitle="No orders match"
        emptyMessage="Clear a filter, or wait for the next paid order."
        selected={selected}
        onSelected={setSelected}
        activeKey={orderId}
        onOpen={(row) => setFilter('order', row.id)}
        bulk={
          <>
            {viewer === 'owner' ? <Button variant="secondary" loading={busy} onClick={openRetryConfirm}>Retry failed</Button> : null}
            {viewer === 'owner' ? <Button variant="destructive" loading={busy} onClick={() => void runBulk('cancel')}>Cancel</Button> : null}
            <a className="inline-flex min-h-11 items-center rounded-md border border-stroke px-3 text-sm text-ink" href={exportHref}>Export</a>
          </>
        }
      />
      {list.data ? (
        <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(page) => setFilter('page', String(page))} onPageSize={(size) => setFilter('pageSize', String(size))} />
      ) : null}
    </section>
  );
}

function OrderDrawer({
  detail,
  viewer,
  deliveryQueue,
  onDone,
}: {
  readonly detail: DetailPayload;
  readonly viewer: 'owner' | 'reseller';
  readonly deliveryQueue: boolean;
  readonly onDone: () => void;
}): JSX.Element {
  const order = detail.order;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [content, setContent] = useState('');
  const [manualItem, setManualItem] = useState('');
  const status = orderDisplayStatus(order);
  const buyer = detail.customer?.username ? `@${detail.customer.username}` : detail.customer?.firstName || 'Buyer';

  async function act(name: string, url: string, body?: unknown): Promise<void> {
    setBusy(name);
    setError(null);
    const result = await runAction(url, body ? { body } : undefined);
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-4 text-ink">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        <StatusPill>{detail.order.channelLabel}</StatusPill>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-ink">{detail.product.title}</p>
          <p className="text-xs text-ink-faint">× {order.quantity} · {detail.product.sourceLabel}{detail.product.supplierSku ? ` · SKU ${detail.product.supplierSku}` : ` · ${detail.product.sku}`}</p>
        </div>
        <p className="font-num text-sm">{money(order.quotedRetailPrice)}</p>
      </div>
      <p className="text-[12.5px] text-ink-faint">Timeline</p>
      <ol className="relative space-y-0 pl-6">
        <span className="absolute bottom-2 left-[5px] top-1 w-px bg-white/12" aria-hidden="true" />
        {(detail.events.length > 0 ? detail.events : [{ label: status.label, at: order.createdAt, tone: status.tone === 'fault' ? 'fault' as const : 'neutral' as const, note: detail.fulfillmentAttempt?.error ?? null }]).map((event) => (
          <li key={`${event.label}-${event.at}`} className="relative pb-3.5">
            <span className={`absolute -left-6 top-1 h-[11px] w-[11px] rounded-full ${event.tone === 'fault' ? 'bg-danger' : event.tone === 'ok' ? 'bg-mint' : 'bg-white/25'}`} />
            <span>
              <span className="block text-sm text-ink">{event.label}</span>
              {event.note ? <span className="block text-xs text-ink-soft">{event.note}</span> : null}
              <span className="block text-xs"><RelativeTime value={event.at} /></span>
            </span>
          </li>
        ))}
      </ol>
      {detail.customer ? (
        <div className="rounded-lg border border-stroke px-3 py-2">
          <p className="text-sm text-ink">{buyer}</p>
          <p className="text-xs text-ink-faint">{detail.customer.orderCount} orders · {detail.customer.balance} balance</p>
        </div>
      ) : null}
      {detail.paymentClaim ? (
        <div className="space-y-1 text-sm">
          <p className="text-ink">Payment claim</p>
          {detail.paymentClaim.binanceOrderId ? <p className="font-num text-xs text-ink-soft">Binance {detail.paymentClaim.binanceOrderId}</p> : null}
          {detail.paymentClaim.txHash ? <p className="break-all font-num text-xs text-ink-soft">Tx {detail.paymentClaim.txHash}</p> : null}
          <p className="text-xs text-ink-faint">Submitted <RelativeTime value={detail.paymentClaim.submittedAt} /></p>
          {detail.paymentClaim.rejectReason ? <p className="text-xs text-ink">{displayOrderEventNote(detail.paymentClaim.rejectReason) ?? detail.paymentClaim.rejectReason}</p> : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-ink">{error}</p> : null}
      {viewer === 'owner' ? (
        <div className="space-y-2">
          <Button className="w-full" loading={busy === 'retry'} onClick={() => void act('retry', API_ROUTES.fulfillmentRetryDelivery(order.id))}>Retry delivery</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" loading={busy === 'refund'} onClick={() => void act('refund', API_ROUTES.orderRefund(order.id))}>Refund to wallet</Button>
            <Button variant="destructive" loading={busy === 'cancel'} onClick={() => void act('cancel', API_ROUTES.orderCancel(order.id), { reason: 'Cancelled from the order drawer' })}>Cancel</Button>
          </div>
          <Button variant="secondary" loading={busy === 'fulfill'} onClick={() => void act('fulfill', API_ROUTES.fulfillmentManualComplete(order.id), { note: note || 'Marked fulfilled' })}>Mark fulfilled</Button>
          {order.deliveryStatus === 'sent' ? (
            detail.replacementOpen ? (
              <Button variant="secondary" disabled>Replacement already open</Button>
            ) : (
              <div className="space-y-2">
                {detail.canReplaceFromSupplier ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    loading={busy === 'replace-supplier'}
                    onClick={() => void act('replace-supplier', '/api/platform/replacements', { decision: 'replace', mode: 'supplier', orderId: order.id, note: note || 'Owner replacement' })}
                  >
                    New item from supplier
                  </Button>
                ) : null}
                <TextAreaField id={`replace-${order.id}`} label="Replacement item" value={manualItem} onChange={(event) => setManualItem(event.target.value)} />
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={busy === 'replace-manual'}
                  onClick={() => void act('replace-manual', '/api/platform/replacements', { decision: 'replace', mode: 'manual', orderId: order.id, content: manualItem, note: note || 'Owner replacement' })}
                >
                  Send manually
                </Button>
              </div>
            )
          ) : null}
          <TextAreaField id={`note-${order.id}`} label="Note" value={note} onChange={(event) => setNote(event.target.value)} />
          <Button variant="ghost" loading={busy === 'note'} onClick={() => void act('note', API_ROUTES.orderNote(order.id), { note })}>Add note</Button>
          {detail.paymentClaim ? (
            <div className="space-y-2">
              <TextAreaField id={`override-${order.id}`} label="Override reason" value={reason} onChange={(event) => setReason(event.target.value)} hint="At least 10 characters." />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" loading={busy === 'verify'} onClick={() => void act('verify', API_ROUTES.adminPaymentOverride(order.id), { action: 'verify', reason })}>Verify payment</Button>
                <Button variant="secondary" loading={busy === 'fail'} onClick={() => void act('fail', API_ROUTES.adminPaymentOverride(order.id), { action: 'fail', reason })}>Fail payment</Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {viewer === 'reseller' && (deliveryQueue || order.fulfillmentStatus === 'manual_pending') ? (
        <div className="space-y-2">
          <TextAreaField id={`deliver-${order.id}`} label="What the buyer receives" value={content} onChange={(event) => setContent(event.target.value)} />
          <Button loading={busy === 'deliver'} onClick={() => void act('deliver', API_ROUTES.resellerDeliver(order.id), { content })}>Mark delivered</Button>
        </div>
      ) : null}
    </div>
  );
}
