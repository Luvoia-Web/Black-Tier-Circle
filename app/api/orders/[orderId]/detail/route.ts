/**
 * @file app/api/orders/[orderId]/detail/route.ts
 *
 * GET, authenticated. Returns full order detail for the slide-in drawer.
 *
 * Owner can fetch any order. Reseller can only fetch orders that belong
 * to their tenant. This route is read-only — it does not change order state.
 *
 * @module Api
 */

import { asDbClient, requireRole, type AuthenticatedSession } from '@/lib/auth/session';
import { AppError, AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { formatUsdt } from '@/lib/money';
import { isGenericDeliveryResult, type OrderDetailEvent, type OrderDetailPayload } from '@/lib/order-detail';
import type { QueryResult } from '@/lib/supabase/query';
import type { DbClient } from '@/lib/supabase/query';
import { getCustomerById } from '@/modules/bots';
import { getProduct } from '@/modules/catalog';
import { getOrderFulfillmentStatus } from '@/modules/fulfillment';
import { getOrder, type Order } from '@/modules/orders';
import { getPaymentStatus } from '@/modules/payments';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

/**
 * Returns assembled order detail for the modal.
 *
 * @throws AuthError when the actor cannot see the order
 * @throws NotFoundError when the order does not exist
 */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireRole(['owner', 'reseller']);
    const db = asDbClient(session.admin);
    const order = await getOrder(db, context.params.orderId);
    await assertCanViewOrder(session, db, order);
    const payload = await buildOrderDetail(db, order);
    return jsonSuccess(payload);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

/**
 * Enforces owner-wide access and reseller tenant ownership.
 *
 * SECURITY: tenant id is loaded from the session user, never from the client.
 *
 * @param session - Authenticated owner or reseller
 * @param db - Admin database client
 * @param order - Loaded order
 * @throws AuthError with 403 when a reseller requests another tenant's order
 */
async function assertCanViewOrder(
  session: AuthenticatedSession,
  db: DbClient,
  order: Order,
): Promise<void> {
  if (session.profile.role === 'owner') {
    return;
  }
  const tenant = await getTenantByUserId(db, session.user.id);
  if (order.tenantId !== tenant.id) {
    throw new AuthError('FORBIDDEN', 'You do not have access to this order', 403);
  }
}

/**
 * Loads product, customer, payment claim, and fulfillment for one order.
 *
 * @param db - Admin database client
 * @param order - Loaded order
 * @returns JSON-safe detail payload (bigint amounts as strings)
 */
async function buildOrderDetail(db: DbClient, order: Order): Promise<OrderDetailPayload> {
  const [product, payment, fulfillment] = await Promise.all([
    getProduct(db, order.productId),
    getPaymentStatus(db, order.id),
    getOrderFulfillmentStatus(db, order.id),
  ]);
  const customer = await loadCustomer(db, order.customerId);
  const attempt = fulfillment.fulfillmentAttempts[0] ?? null;
  const claim = payment.claim;
  const labels = await sourceAndChannel(db, order.tenantId, order.channel, product.supplierId);
  const [events, replacementOpen] = await Promise.all([loadEvents(db, order.id, attempt?.error ?? null), openReplacement(db, order.id)]);
  return {
    order: { ...serializeOrder(order), channelLabel: labels.channelLabel },
    product: { title: product.title, sku: product.sku, supplierSku: product.supplierSku, deliveryType: product.deliveryType, sourceLabel: labels.sourceLabel },
    customer,
    paymentClaim: claim
      ? {
          binanceOrderId: claim.binanceOrderId,
          txHash: claim.txHash,
          submittedAt: claim.submittedAt.toISOString(),
          verifiedAt: claim.verifiedAt ? claim.verifiedAt.toISOString() : null,
          rejectReason: claim.rejectReason,
        }
      : null,
    fulfillmentAttempt: attempt
      ? {
          method: attempt.method,
          status: attempt.status,
          artifactPath: attempt.artifactPath,
          completedAt: attempt.completedAt ? attempt.completedAt.toISOString() : null,
          error: attempt.error,
        }
      : null,
    deliveredContent: resolveDeliveredContent(attempt?.artifactPath ?? null, fulfillment.deliveryAttempts),
    events,
    replacementOpen,
  };
}

/**
 * Loads a customer record, returning null when missing or unlinked.
 *
 * @param db - Admin database client
 * @param customerId - Customer UUID, if the order has one
 */
async function loadCustomer(
  db: DbClient,
  customerId: string | null,
): Promise<OrderDetailPayload['customer']> {
  if (customerId === null) {
    return null;
  }
  try {
    const customer = await getCustomerById(db, customerId);
    const orders = (await db.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customerId)) as QueryResult<unknown>;
    return {
      telegramUserId: customer.telegramUserId,
      telegramChatId: customer.telegramChatId,
      firstName: customer.firstName,
      username: customer.username,
      orderCount: orders.count ?? 0,
      balance: formatUsdt(customer.creditBalanceMinor),
    };
  } catch {
    // Customer rows can be deleted independently of orders; the drawer still renders.
    return null;
  }
}

/**
 * Serializes order money and dates for JSON.
 *
 * @param order - Domain order
 */
async function sourceAndChannel(
  db: DbClient,
  tenantId: string | null,
  channel: Order['channel'],
  supplierId: string | null,
): Promise<{ sourceLabel: string; channelLabel: string }> {
  let sourceLabel = 'Own Product';
  if (supplierId) {
    const supplier = await db.from('suppliers').select('name').eq('id', supplierId).maybeSingle();
    const name = (supplier.data as { name?: string } | null)?.name;
    sourceLabel = name && name.length > 0 ? name : 'Supplier API';
  }
  if (channel === 'owner_store' || tenantId === null) {
    return { sourceLabel, channelLabel: 'Owner Store' };
  }
  const tenant = await db.from('tenants').select('display_name').eq('id', tenantId).maybeSingle();
  const store = (tenant.data as { display_name?: string } | null)?.display_name;
  return { sourceLabel, channelLabel: store && store.length > 0 ? store : 'Reseller' };
}

function serializeOrder(order: Order): Omit<OrderDetailPayload['order'], 'channelLabel'> {
  return {
    id: order.id,
    channel: order.channel,
    paymentStatus: order.paymentStatus,
    fundingStatus: order.fundingStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    deliveryStatus: order.deliveryStatus,
    quotedRetailPrice: order.quotedRetailPriceMinor.toString(),
    quotedWholesalePrice: order.quotedWholesalePriceMinor.toString(),
    paymentMethod: order.paymentMethod,
    externalOrderRef: order.externalOrderRef,
    idempotencyKey: order.idempotencyKey,
    quantity: order.quantity,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/**
 * Prefers the fulfillment artifact path; otherwise a non-generic delivery result.
 *
 * @param artifactPath - Stored file ref / supplier ref, if any
 * @param deliveryAttempts - Delivery attempts newest-first
 */
async function loadEvents(db: DbClient, orderId: string, supplierReason: string | null): Promise<OrderDetailEvent[]> {
  const result = (await db.from('order_events').select('track, to_status, note, created_at').eq('order_id', orderId).order('created_at', { ascending: true }).limit(12)) as QueryResult<unknown>;
  if (result.error) {
    throw new AppError('ORDER_DETAIL_FAILED', result.error.message, 500);
  }
  if (!Array.isArray(result.data)) return supplierReason ? [{ label: 'Supplier update', at: new Date().toISOString(), tone: 'fault' as const, note: supplierReason }] : [];
  const events = result.data
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => {
      const to = typeof row.to_status === 'string' ? row.to_status : '';
      const track = typeof row.track === 'string' ? row.track : '';
      const note = typeof row.note === 'string' ? row.note : null;
      const at = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString();
      const failed = to === 'failed' || to === 'unreachable' || to === 'expired';
      const done = to === 'verified' || to === 'sent' || to === 'ready';
      return {
        label: eventLabel(track, to),
        at,
        tone: failed ? 'fault' as const : done ? 'ok' as const : 'neutral' as const,
        note,
      };
    });
  if (supplierReason && !events.some((event) => event.note === supplierReason)) {
    const last = events.length > 0 ? events[events.length - 1] : undefined;
    events.push({ label: 'Supplier rejected the order', at: last?.at ?? new Date().toISOString(), tone: 'fault', note: supplierReason });
  }
  return events;
}

function eventLabel(track: string, to: string): string {
  if (track === 'payment' && to === 'verified') return 'Paid';
  if (track === 'payment' && to === 'awaiting') return 'Awaiting payment';
  if (track === 'fulfillment' && (to === 'supplier_pending' || to === 'processing')) return 'Sent to the supplier';
  if (track === 'fulfillment' && to === 'failed') return 'Supplier rejected the order';
  if (track === 'fulfillment' && to === 'ready') return 'Ready to deliver';
  if (track === 'delivery' && to === 'sent') return 'Delivered';
  if (to === 'not_ready' || to === 'queued') return 'Not delivered yet';
  return `${track} ${to}`.trim();
}

async function openReplacement(db: DbClient, orderId: string): Promise<boolean> {
  const result = (await db.from('replacement_requests').select('id').eq('order_id', orderId).in('status', ['pending', 'approved']).limit(1)) as QueryResult<unknown>;
  if (result.error) {
    const message = result.error.message.toLowerCase();
    if (result.error.code === '42P01' || result.error.code === '42703' || message.includes('does not exist') || message.includes('schema cache')) return false;
    throw new AppError('ORDER_DETAIL_FAILED', result.error.message, 500);
  }
  return Array.isArray(result.data) && result.data.length > 0;
}

function resolveDeliveredContent(
  artifactPath: string | null,
  deliveryAttempts: ReadonlyArray<{ readonly status: string; readonly result: string | null }>,
): string | null {
  if (artifactPath && artifactPath.length > 0) {
    return artifactPath;
  }
  const delivered = deliveryAttempts.find((item) => {
    return item.status === 'success' && item.result !== null && !isGenericDeliveryResult(item.result);
  });
  return delivered?.result ?? null;
}
