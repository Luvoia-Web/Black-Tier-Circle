/**
 * @file app/api/v1/orders/route.ts
 *
 * GET: list tenant orders. POST: create an order (idempotent).
 *
 * @module ApiV1
 */

import { API_CONFIG } from '@/lib/api-config';
import { readJsonBody } from '@/lib/http';
import { authenticateV1Request, handleV1Error, parsePagination, v1Db, v1Error, v1Success } from '@/lib/v1-auth';
import { v1CreatedOrder } from '@/lib/v1-presenters';
import { V1CreateOrderSchema } from '@/lib/validations/v1';
import { AuthError, ValidationError } from '@/lib/errors';
import { createOrder, listOrders, type PaymentStatus } from '@/modules/orders';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const PAYMENT_STATUSES = new Set<PaymentStatus>([
  'not_required',
  'awaiting',
  'pending_verification',
  'verified',
  'failed',
  'expired',
  'refund_pending',
  'refunded',
  'disputed',
]);

/**
 * Lists orders for this tenant.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const ctx = await authenticateV1Request(
      request,
      'orders:read',
      'orders.read',
      API_CONFIG.rateLimits.readRequestsPerMinute,
    );
    const params = new URL(request.url).searchParams;
    const { page, limit, offset } = parsePagination(params);
    const status = params.get('status');
    const paymentStatus =
      status && PAYMENT_STATUSES.has(status as PaymentStatus) ? (status as PaymentStatus) : undefined;
    const db = v1Db();
    const extra = await listOrders(db, {
      tenantId: ctx.tenantId,
      ...(paymentStatus !== undefined ? { paymentStatus } : {}),
      limit: limit + 1,
      offset,
    });
    const hasMore = extra.length > limit;
    const pageRows = extra.slice(0, limit);
    return v1Success(
      pageRows.map((order) => ({
        orderId: order.id,
        productId: order.productId,
        customerRef: order.externalOrderRef,
        status: {
          payment: order.paymentStatus,
          funding: order.fundingStatus,
          fulfillment: order.fulfillmentStatus,
          delivery: order.deliveryStatus,
        },
        retailPrice: order.quotedRetailPriceMinor.toString(),
        createdAt: order.createdAt.toISOString(),
      })),
      {
        page,
        limit,
        total: offset + pageRows.length + (hasMore ? 1 : 0),
        hasMore,
      },
    );
  } catch (error: unknown) {
    return handleV1Error(error);
  }
}

/**
 * Creates a reseller API order. Requires X-Idempotency-Key.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const ctx = await authenticateV1Request(
      request,
      'orders:write',
      'orders.create',
      API_CONFIG.rateLimits.orderCreationPerMinute,
    );
    const idempotencyKey = request.headers.get(API_CONFIG.idempotencyHeader)?.trim() ?? '';
    if (!idempotencyKey) {
      return v1Error(
        API_CONFIG.errors.VALIDATION_ERROR,
        `${API_CONFIG.idempotencyHeader} header is required`,
        400,
      );
    }
    const parsed = V1CreateOrderSchema.parse(await readJsonBody(request));
    const db = v1Db();
    const order = await createOrder(db, {
      channel: 'api',
      tenantId: ctx.tenantId,
      botId: 'owner',
      productId: parsed.productId,
      idempotencyKey: `v1:${ctx.tenantId}:${idempotencyKey}`,
      externalOrderRef: parsed.customerRef,
      ...(parsed.quantity !== undefined ? { quantity: parsed.quantity } : {}),
    });
    if (order.tenantId !== ctx.tenantId) {
      throw new AuthError(API_CONFIG.errors.FORBIDDEN, 'Order does not belong to this tenant', 403);
    }
    return v1Success(v1CreatedOrder(order), undefined, 201);
  } catch (error: unknown) {
    if (error instanceof ValidationError && error.code === 'IDEMPOTENCY_CONFLICT') {
      return v1Error(API_CONFIG.errors.IDEMPOTENCY_CONFLICT, error.message, 409);
    }
    return handleV1Error(error);
  }
}
