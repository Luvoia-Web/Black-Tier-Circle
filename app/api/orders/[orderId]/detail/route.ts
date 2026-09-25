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
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { isGenericDeliveryResult, type OrderDetailPayload } from '@/lib/order-detail';
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
  return {
    order: { ...serializeOrder(order), channelLabel: labels.channelLabel },
    product: { title: product.title, sku: product.sku, deliveryType: product.deliveryType, sourceLabel: labels.sourceLabel },
    customer,
    paymentClaim: claim
      ? {
          binanceOrderId: claim.binanceOrderId,
          txHash: claim.txHash,
          submittedAt: claim.submittedAt.toISOString(),
          verifiedAt: claim.verifiedAt ? claim.verifiedAt.toISOString() : null,
        }
      : null,
    fulfillmentAttempt: attempt
      ? {
          method: attempt.method,
          status: attempt.status,
          artifactPath: attempt.artifactPath,
          completedAt: attempt.completedAt ? attempt.completedAt.toISOString() : null,
        }
      : null,
    deliveredContent: resolveDeliveredContent(attempt?.artifactPath ?? null, fulfillment.deliveryAttempts),
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
    return {
      telegramUserId: customer.telegramUserId,
      telegramChatId: customer.telegramChatId,
      firstName: customer.firstName,
      username: customer.username,
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
