/**
 * @file lib/order-memory.ts
 *
 * Records a completed purchase in the customer memory bank.
 * Invoked only after fulfillment has already succeeded.
 *
 * @module OrderMemory
 */

import { logger } from '@/lib/logger';
import { minorToUsdt } from '@/lib/money';
import type { DbClient } from '@/lib/supabase/query';
import { getProduct } from '@/modules/catalog';
import { getOrder } from '@/modules/orders';
import { resolveCustomerMemoryBank, retainCommerceExperience } from '@/lib/hindsight';

/**
 * Starts purchase memory retention without waiting on it.
 * Failures are logged and never surface to the fulfillment pipeline.
 */
export function scheduleFulfilledOrderMemory(supabase: DbClient, data: Record<string, unknown>): void {
  const orderId = typeof data.orderId === 'string' ? data.orderId : '';
  if (orderId.length === 0 || process.env.HINDSIGHT_ENABLED !== 'true') {
    return;
  }
  void retainFulfilledOrderMemory(supabase, orderId).catch((error: unknown) => {
    logger.warn('order memory retain failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  });
}

async function retainFulfilledOrderMemory(supabase: DbClient, orderId: string): Promise<void> {
  try {
    const order = await getOrder(supabase, orderId);
    if (order.tenantId === null || order.customerId === null) {
      return;
    }
    const product = await getProduct(supabase, order.productId);
    const amount = minorToUsdt(order.quotedRetailPriceMinor);
    const bankId = resolveCustomerMemoryBank(order.tenantId, order.customerId);
    const purchasedAt = new Date().toISOString();

    // MemoryOS: non-blocking side-effect, never blocks commerce
    await retainCommerceExperience(
      bankId,
      `customer-interaction:${order.id}`,
      `Customer purchased ${product.title} for ${amount} USDT on ${purchasedAt}`,
      ['kind:purchase_context'],
      { orderId: order.id, productId: order.productId, amount },
    );

    const listMinor = product.retailPriceMinor * BigInt(order.quantity);
    if (order.quotedRetailPriceMinor < listMinor) {
      const originalPrice = minorToUsdt(listMinor);
      // MemoryOS: non-blocking side-effect, never blocks commerce
      await retainCommerceExperience(
        bankId,
        `preference:${order.id}`,
        `Customer accepted discounted price — original price was ${originalPrice}, purchased at ${amount}`,
        ['kind:customer_preference'],
        { originalPrice, finalPrice: amount },
      );
    }
  } catch (error: unknown) {
    logger.warn('order memory retain failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}
