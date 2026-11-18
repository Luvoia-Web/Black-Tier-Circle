'use client';

/**
 * Orders, as in the reference: tiles, chips, a dense table, and the drawer.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Download, RefreshCw, ShoppingBag, Timer, Wallet } from 'lucide-react';
import { useSetDrawerBody } from '@/components/platform/drawer-body';
import { Button, DataTable, ErrorState, Pagination, RelativeTime, SelectField, Skeleton, StatTile, StatusPill, TextAreaField, TextField, type Column } from '@/components/platform/ui';
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

function initials(title: string): string {
  const parts = title.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : (parts[0] ?? 'PR').slice(0, 2);
  return letters.toUpperCase();
}

function statusOf(row: { readonly paymentStatus: string; readonly fulfillmentStatus: string; readonly deliveryStatus: string }): { readonly label: string; readonly tone: 'ok' | 'fault' | 'warn' | 'neutral' } {
  if (row.deliveryStatus === 'sent') return { label: 'Delivered', tone: 'ok' };
  if (row.paymentStatus === 'expired') return { label: 'Expired', tone: 'warn' };
  if (row.fulfillmentStatus === 'failed' || row.paymentStatus === 'failed' || row.deliveryStatus === 'unreachable') {
    return { label: row.fulfillmentStatus === 'failed' ? 'Failed at supplier' : 'Failed', tone: 'fault' };
  }
  if (row.fulfillmentStatus === 'supplier_pending' || row.fulfillmentStatus === 'processing' || row.fulfillmentStatus === 'queued') {
    return { label: 'Activating', tone: 'warn' };
  }
  if (row.paymentStatus === 'awaiting' || row.paymentStatus === 'pending_verification') return { label: 'Awaiting payment', tone: 'warn' };
  return { label: 'In progress', tone: 'neutral' };
}

function dot(on: boolean, fault: boolean): string {
  if (fault) return 'bg-danger';
  if (on) return 'bg-mint';
  return 'bg-white/20';
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

  async function runBulk(kind: 'retry' | 'cancel'): Promise<void> {
    const ids = [...selected].slice(0, 25);
    if (ids.length === 0) return;
    setBusy(true);
    const results: string[] = [];
    for (const id of ids) {
      const row = list.data?.rows.find((item) => item.id === id);
      if (kind === 'retry' && row && row.fulfillmentStatus !== 'failed' && row.deliveryStatus !== 'retry_pending' && row.deliveryStatus !== 'unreachable') {
        results.push(`${id.slice(0, 8)} skipped`);
        continue;
      }
      const result = kind === 'retry'
        ? await runAction(API_ROUTES.fulfillmentRetryDelivery(id))
        : await runAction(API_ROUTES.orderCancel(id), { body: { reason: 'Cancelled from the orders list' } });
      results.push(result.ok ? `${id.slice(0, 8)} ${kind === 'retry' ? 'retried' : 'cancelled'}` : `${id.slice(0, 8)} failed: ${result.error.message}`);
    }
    setBusy(false);
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
          <span className="font-num text-ink">{row.id.slice(0, 8).toUpperCase()}</span>
          <span className="mt-0.5 block text-xs"><RelativeTime value={row.createdAt} /></span>
        </span>
      ),
    },
    {
      id: 'product',
      header: 'Product',
      render: (row) => (
        <span className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-rose/15 text-xs font-medium text-rose">{initials(row.productTitle)}</span>
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
        const status = statusOf(row);
        return (
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1" aria-hidden="true">
              <span className={`h-2 w-2 rounded-full ${dot(paid, row.paymentStatus === 'failed')}`} />
              <span className={`h-2 w-2 rounded-full ${dot(supplier, supplierFault)}`} />
              <span className={`h-2 w-2 rounded-full ${dot(delivered, row.deliveryStatus === 'unreachable')}`} />
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
  const failedCount = summary?.chips.failed ?? 0;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl text-ink">Orders</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Payment, supplier and delivery on one timeline
            {summary ? ` · ${summary.needsAttention} need attention` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex min-h-11 items-center gap-2 rounded-md border border-stroke px-3 text-sm text-ink" href={exportHref}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </a>
          {viewer === 'owner' ? (
            <Button variant="secondary" loading={busy} onClick={() => void runBulk('retry')}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry failed ({failedCount})
            </Button>
          ) : null}
        </div>
      </header>
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Orders today" value={String(summary.ordersToday)} icon={ShoppingBag} tone="rose" />
          <StatTile label="Revenue today" value={money(summary.revenueTodayMinor)} icon={Wallet} tone="sky" />
          <StatTile label="Needs attention" value={String(summary.needsAttention)} icon={AlertTriangle} tone="amber" />
          <StatTile label="Median delivery" value={summary.medianDeliverySeconds === null ? '—' : `${summary.medianDeliverySeconds} sec`} icon={Timer} tone="mint" />
        </div>
      ) : list.loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm ${on ? 'border-rose bg-rose/15 text-ink' : 'border-stroke text-ink-soft'}`}
              onClick={() => setFilter('chip', chip.id === 'all' ? '' : chip.id)}
            >
              {chip.label}
              {typeof count === 'number' ? <span className="font-num text-xs">{count}</span> : null}
            </button>
          );
        })}
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
        {viewer === 'owner' ? (
          <SelectField
            id="order-store"
            label="Store"
            value={params.get('store') ?? ''}
            options={[{ value: '', label: 'All stores' }, ...(summary?.stores ?? []).map((store) => ({ value: store.id, label: store.label }))]}
            onChange={(event) => setFilter('store', event.target.value)}
          />
        ) : null}
        <TextField id="order-search" label="Search" placeholder="Order, buyer, or product" defaultValue={params.get('q') ?? ''} onBlur={(event) => setFilter('q', event.target.value)} />
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
        onOpen={(row) => setFilter('order', row.id)}
        bulk={
          <>
            {viewer === 'owner' ? <Button variant="secondary" loading={busy} onClick={() => void runBulk('retry')}>Retry failed</Button> : null}
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
  const status = statusOf(order);
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
      <ol className="space-y-3">
        {(detail.events.length > 0 ? detail.events : [{ label: status.label, at: order.createdAt, tone: status.tone === 'fault' ? 'fault' as const : 'neutral' as const, note: detail.fulfillmentAttempt?.error ?? null }]).map((event) => (
          <li key={`${event.label}-${event.at}`} className="flex gap-2">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.tone === 'fault' ? 'bg-danger' : event.tone === 'ok' ? 'bg-mint' : 'bg-white/30'}`} />
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
          {detail.paymentClaim.rejectReason ? <p className="text-xs text-ink">{detail.paymentClaim.rejectReason}</p> : null}
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
            <Button
              variant="secondary"
              loading={busy === 'replace'}
              disabled={detail.replacementOpen}
              onClick={() => void act('replace', '/api/platform/replacements', { decision: 'replace', orderId: order.id, note: note || 'Owner replacement' })}
            >
              {detail.replacementOpen ? 'Replacement already open' : 'Replace'}
            </Button>
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
