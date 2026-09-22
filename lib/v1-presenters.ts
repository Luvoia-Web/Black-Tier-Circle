/**
 * @file lib/v1-presenters.ts
 *
 * Shared response mapping for public v1 order payloads.
 *
 * @module V1
 */

import { payoutAddressFor } from '@/lib/payment-config';
import { minorToUsdt } from '@/lib/money';
import type { DbClient } from '@/lib/supabase/query';
import type { Order } from '@/modules/orders';
import { resolveOrderPayments, type PaymentClaim } from '@/modules/payments';

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

export async function v1CreatedOrder(supabase: DbClient, order: Order): Promise<Record<string, unknown>> {
  const resolved = await resolveOrderPayments(supabase, order.tenantId);
  return {
    orderId: order.id,
    status: v1OrderStatus(order),
    retailPrice: minorToUsdt(order.quotedRetailPriceMinor),
    wholesalePrice: minorToUsdt(order.quotedWholesalePriceMinor),
    paymentOptions: {
      binancePay: { available: resolved.binance !== null || resolved.demo },
      bep20: { available: true, walletAddress: payoutAddressFor(resolved.bep20Address) },
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
