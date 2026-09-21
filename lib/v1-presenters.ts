/**
 * @file lib/v1-presenters.ts
 *
 * Shared response mapping for public v1 order payloads.
 *
 * @module V1
 */

import { getBep20PayoutAddress } from '@/lib/payment-config';
import { minorToUsdt } from '@/lib/money';
import type { Order } from '@/modules/orders';
import type { PaymentClaim } from '@/modules/payments';

export function v1OrderStatus(order: Order): {
  payment: string;
  funding: string;
  fulfillment: string;
  delivery: string;
} {
  return {
    payment: order.paymentStatus,
    funding: order.fundingStatus,
    fulfillment: order.fulfillmentStatus,
    delivery: order.deliveryStatus,
  };
}

export function v1CreatedOrder(order: Order): Record<string, unknown> {
  return {
    orderId: order.id,
    status: v1OrderStatus(order),
    retailPrice: minorToUsdt(order.quotedRetailPriceMinor),
    wholesalePrice: minorToUsdt(order.quotedWholesalePriceMinor),
    paymentOptions: {
      binancePay: { available: true },
      bep20: { available: true, walletAddress: getBep20PayoutAddress() },
    },
    createdAt: order.createdAt.toISOString(),
  };
}

export function v1OrderDetail(order: Order, claim: PaymentClaim | null): Record<string, unknown> {
  return {
    orderId: order.id,
    productId: order.productId,
    customerRef: order.externalOrderRef,
    status: v1OrderStatus(order),
    retailPrice: minorToUsdt(order.quotedRetailPriceMinor),
    wholesalePrice: minorToUsdt(order.quotedWholesalePriceMinor),
    paymentClaim: claim
      ? {
          method: claim.paymentMethod,
          submittedAt: claim.submittedAt.toISOString(),
          verifiedAt: claim.verifiedAt ? claim.verifiedAt.toISOString() : null,
        }
      : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
