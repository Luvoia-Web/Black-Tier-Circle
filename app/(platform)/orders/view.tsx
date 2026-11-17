'use client';

/**
 * One order list. The drawer is the timeline. Bulk retry is capped.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSetDrawerBody } from '@/components/platform/drawer-body';
import { Button, Card, DataTable, ErrorState, FilterBar, Pagination, SelectField, StatusPill, TextField, type Column } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { OrderListRow } from '@/modules/platform/orders';

type PagePayload = {
  readonly rows: readonly OrderListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
};

type DetailPayload = {
  readonly order: {
    readonly id: string;
    readonly paymentStatus: string;
    readonly fulfillmentStatus: string;
    readonly deliveryStatus: string;
    readonly externalOrderRef: string | null;
    readonly quotedRetailPrice: string;
    readonly channelLabel: string;
  };
  readonly product: { readonly title: string };
  readonly deliveredContent: string | null;
  readonly fulfillmentAttempt: { readonly status: string; readonly method: string } | null;
};

const STATES = [
  { value: '', label: 'Every state' },
  { value: 'payment:verified', label: 'Paid' },
  { value: 'payment:failed', label: 'Payment failed' },
  { value: 'fulfillment:failed', label: 'Fulfillment failed' },
  { value: 'fulfillment:manual_pending', label: 'Waiting on fulfillment' },
  { value: 'delivery:sent', label: 'Delivered' },
  { value: 'fulfillment:canceled', label: 'Cancelled' },
];

export function OrdersView(): JSX.Element {
  const params = useSearchParams();
  const router = useRouter();
  const setDrawer = useSetDrawerBody();
  const query = params.toString();
  const list = useData<PagePayload>(`/api/platform/orders${query ? `?${query}` : ''}`);
  const replacements = useData<{ readonly needsMigration: boolean; readonly rows: readonly { readonly id: string; readonly orderId: string; readonly reason: string }[] }>('/api/platform/replacements');
  const orderId = params.get('order');
  const detail = useData<DetailPayload>(orderId ? API_ROUTES.orderDetail(orderId) : null);
  const { data: detailData, loading: detailLoading, error: detailError, refetch: refetchDetail } = detail;
  const { refetch: refetchList } = list;
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setDrawer(null);
      return;
    }
    setDrawer(
      detailLoading ? <p>Loading this order…</p>
        : detailError ? <ErrorState message={detailError.message} onRetry={refetchDetail} />
          : detailData ? <OrderTimeline detail={detailData} onDone={() => { refetchDetail(); refetchList(); }} />
            : <p>This order was not found.</p>,
    );
    return () => setDrawer(null);
  }, [orderId, detailData, detailLoading, detailError, refetchDetail, refetchList, setDrawer]);

  function setFilter(key: string, value: string): void {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page' && key !== 'order') next.delete('page');
    const valueText = next.toString();
    router.replace(valueText ? `${ROUTES.platform.orders}?${valueText}` : ROUTES.platform.orders, { scroll: false });
  }

  async function retrySelected(): Promise<void> {
    const ids = [...selected].filter((id) => list.data?.rows.some((row) => row.id === id && row.fulfillmentStatus === 'failed')).slice(0, 25);
    if (ids.length === 0) {
      setNotice('Select failed orders first. Nothing was retried.');
      return;
    }
    setBusy(true);
    const results: string[] = [];
    for (const id of ids) {
      const result = await runAction(API_ROUTES.fulfillmentRetryDelivery(id));
      results.push(result.ok ? `${id.slice(0, 8)} retried` : `${id.slice(0, 8)} failed: ${result.error.message}`);
    }
    setBusy(false);
    setNotice(results.join(' · '));
    setSelected(new Set());
    list.refetch();
  }

  const columns: Column<OrderListRow>[] = [
    { id: 'id', header: 'Order', render: (row) => <span className="font-num">{row.id.slice(0, 8)}</span> },
    { id: 'product', header: 'Product', render: (row) => row.productTitle },
    { id: 'customer', header: 'Customer', render: (row) => row.customerLabel },
    { id: 'payment', header: 'Payment', render: (row) => <StatusPill tone={row.paymentStatus === 'verified' ? 'ok' : row.paymentStatus === 'failed' ? 'fault' : 'warn'}>{row.paymentStatus}</StatusPill> },
    { id: 'fulfillment', header: 'Supplier', render: (row) => <StatusPill tone={row.fulfillmentStatus === 'ready' ? 'ok' : row.fulfillmentStatus === 'failed' ? 'fault' : 'neutral'}>{row.fulfillmentStatus}</StatusPill> },
    { id: 'delivery', header: 'Delivery', render: (row) => <StatusPill tone={row.deliveryStatus === 'sent' ? 'ok' : row.deliveryStatus === 'unreachable' ? 'fault' : 'neutral'}>{row.deliveryStatus}</StatusPill> },
    { id: 'total', header: 'Total', numeric: true, render: (row) => row.total },
  ];

  const exportHref = `/api/platform/orders?${new URLSearchParams({ ...Object.fromEntries(params.entries()), format: 'csv' }).toString()}`;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl text-ink">Orders</h1>
          <p className="mt-1 text-sm text-ink-soft">Payment, the supplier order, and delivery on one timeline.</p>
        </div>
        <a className="inline-flex min-h-11 items-center rounded-md border border-stroke px-3 text-sm text-ink" href={exportHref}>Export CSV</a>
      </header>
      <FilterBar>
        <TextField id="order-search" label="Search" placeholder="Order id or customer" defaultValue={params.get('q') ?? ''} onBlur={(event) => setFilter('q', event.target.value)} />
        <SelectField id="order-state" label="State" value={params.get('state') ?? ''} options={STATES} onChange={(event) => setFilter('state', event.target.value)} />
        <SelectField id="order-channel" label="Channel" value={params.get('channel') ?? ''} options={[{ value: '', label: 'Every channel' }, { value: 'owner_store', label: 'Owner store' }, { value: 'reseller_bot', label: 'Reseller bot' }, { value: 'api', label: 'API' }]} onChange={(event) => setFilter('channel', event.target.value)} />
        <TextField id="order-store" label="Store" placeholder="owner or tenant id" defaultValue={params.get('store') ?? ''} onBlur={(event) => setFilter('store', event.target.value)} />
        <TextField id="order-product" label="Product" placeholder="Product id" defaultValue={params.get('product') ?? ''} onBlur={(event) => setFilter('product', event.target.value)} />
        <TextField id="order-customer" label="Customer" placeholder="Customer id" defaultValue={params.get('customer') ?? ''} onBlur={(event) => setFilter('customer', event.target.value)} />
        <TextField id="order-from" label="From" type="date" defaultValue={params.get('from') ?? ''} onBlur={(event) => setFilter('from', event.target.value)} />
        <TextField id="order-to" label="To" type="date" defaultValue={params.get('to') ?? ''} onBlur={(event) => setFilter('to', event.target.value)} />
      </FilterBar>
      {notice ? <p className="text-sm text-ink">{notice}</p> : null}
      <DataTable
        caption="Orders"
        columns={columns}
        rows={list.data?.rows ?? []}
        rowKey={(row) => row.id}
        loading={list.loading}
        error={list.error?.message ?? null}
        onRetry={list.refetch}
        emptyTitle="No orders match"
        emptyMessage="Clear a filter, or wait for the next paid order."
        selected={selected}
        onSelected={setSelected}
        onOpen={(row) => setFilter('order', row.id)}
        bulk={<Button variant="secondary" loading={busy} onClick={() => void retrySelected()}>Retry failed</Button>}
      />
      {list.data ? (
        <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(page) => setFilter('page', String(page))} onPageSize={(size) => setFilter('pageSize', String(size))} />
      ) : null}
      <Card title="Replacements">
        {replacements.data?.needsMigration ? <p className="text-sm text-ink">Replacements need migration 0032.</p> : null}
        {(replacements.data?.rows.length ?? 0) === 0 && !replacements.data?.needsMigration ? <p className="text-sm text-ink-soft">No open replacement requests.</p> : null}
        <ul className="space-y-2">
          {(replacements.data?.rows ?? []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink">{row.reason}</span>
              <span className="flex gap-2">
                <Button onClick={() => { void runAction('/api/platform/replacements', { method: 'POST', body: { id: row.id, decision: 'approved', note: '' } }).then(() => replacements.refetch()); }}>Approve</Button>
                <Button variant="secondary" onClick={() => { void runAction('/api/platform/replacements', { method: 'POST', body: { id: row.id, decision: 'rejected', note: 'Rejected from Orders' } }).then(() => replacements.refetch()); }}>Reject</Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function OrderTimeline({ detail, onDone }: { readonly detail: DetailPayload; readonly onDone: () => void }): JSX.Element {
  const order = detail.order;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const failed = order.fulfillmentStatus === 'failed' || order.deliveryStatus === 'retry_pending' || order.deliveryStatus === 'unreachable';

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
    <div className="space-y-4">
      <p className="text-sm text-ink">{detail.product.title}</p>
      <ol className="space-y-2 text-sm">
        <li className="text-ink">Payment · {order.paymentStatus}</li>
        <li className="text-ink">Supplier order · {order.fulfillmentStatus}{order.externalOrderRef ? ` · ${order.externalOrderRef}` : ''}</li>
        <li className="text-ink">Delivery · {order.deliveryStatus}</li>
      </ol>
      {detail.fulfillmentAttempt ? <p className="text-sm text-ink-soft">Last attempt: {detail.fulfillmentAttempt.method}, {detail.fulfillmentAttempt.status}.</p> : null}
      {failed ? <p className="text-sm" style={{ color: 'var(--fault-ink)' }}>Fulfillment did not finish. Retry delivery, or mark it fulfilled if you sent it yourself.</p> : null}
      {detail.deliveredContent ? <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-stroke bg-plane p-3 font-num text-xs text-ink">{detail.deliveredContent}</pre> : <p className="text-sm text-ink-soft">Nothing has been delivered yet.</p>}
      <div className="flex flex-wrap gap-2">
        {failed ? <Button variant="secondary" loading={busy === 'retry'} onClick={() => void act('retry', API_ROUTES.fulfillmentRetryDelivery(order.id))}>Retry</Button> : null}
        {order.fulfillmentStatus === 'manual_pending' ? <Button variant="secondary" loading={busy === 'done'} onClick={() => void act('done', API_ROUTES.fulfillmentManualComplete(order.id), { note: 'Marked fulfilled from Orders' })}>Mark fulfilled</Button> : null}
        {order.paymentStatus === 'verified' && order.fulfillmentStatus !== 'ready' ? <Button variant="secondary" loading={busy === 'refund'} onClick={() => void act('refund', API_ROUTES.orderRefund(order.id))}>Refund</Button> : null}
        {order.fulfillmentStatus !== 'canceled' && order.fulfillmentStatus !== 'ready' ? <Button variant="destructive" loading={busy === 'cancel'} onClick={() => void act('cancel', API_ROUTES.orderCancel(order.id), { reason: 'Cancelled from Orders' })}>Cancel</Button> : null}
      </div>
      {error ? <p className="text-sm" style={{ color: 'var(--fault-ink)' }}>{error}</p> : null}
    </div>
  );
}
