/**
 * @file modules/supplier/place.ts
 *
 * Places a catalog order with the supplier stored on the product.
 * Does not import the fulfillment module.
 */

import { decrypt } from '@/lib/encryption';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { usdtToMinor } from '@/lib/money';
import type { DbClient } from '@/lib/supabase/query';
import { SupplierError, createProdSellerClient, type ProdSellerOrder } from '@/integrations/prodseller/client';

export type SupplierFulfillment = {
  readonly supplierOrderId: string;
  readonly deliveryContent: string | null;
  readonly requiresPolling: boolean;
  readonly status: 'delivered' | 'paid' | 'failed';
  readonly amountUsdt: number;
  readonly activationEta: string | null;
};

type SupplierRow = {
  readonly id: string;
  readonly base_url: string;
  readonly api_key_encrypted: string | null;
  readonly auth_header_name: string;
  readonly status: string;
};

function deliveryText(order: ProdSellerOrder): string | null {
  if (order.deliveredKeys && order.deliveredKeys.length > 0) {
    return order.deliveredKeys.join('\n');
  }
  if (order.deliveredKey) {
    return order.deliveredKey;
  }
  if (order.activation) {
    return `Activated for ${order.activation.emails.join(', ')}`;
  }
  return null;
}

export function mapSupplierOrder(order: ProdSellerOrder): SupplierFulfillment {
  const content = deliveryText(order);
  const shared = {
    supplierOrderId: order.orderId,
    amountUsdt: order.amount,
    activationEta: order.activation?.eta ?? null,
  };
  if (order.status === 'delivered' && content) {
    return {
      ...shared,
      deliveryContent: content,
      requiresPolling: false,
      status: 'delivered',
    };
  }
  if (order.status === 'failed') {
    return {
      ...shared,
      deliveryContent: null,
      requiresPolling: false,
      status: 'failed',
    };
  }
  return {
    ...shared,
    deliveryContent: content,
    requiresPolling: true,
    status: 'paid',
  };
}

export async function loadSupplierClient(supabase: DbClient, supplierId: string) {
  const { data, error } = await supabase.from('suppliers').select('*').eq('id', supplierId).maybeSingle();
  if (error) {
    throw new AppError('SUPPLIER_LOOKUP_FAILED', error.message, 500);
  }
  const row = data as SupplierRow | null;
  if (!row || !row.api_key_encrypted) {
    throw new AppError('SUPPLIER_NOT_CONFIGURED', 'Supplier API key is not saved', 400);
  }
  return createProdSellerClient(decrypt(row.api_key_encrypted), row.base_url, row.auth_header_name);
}

/**
 * Places the supplier order. idempotencyKey is our order id.
 */
export async function fulfillViaSupplier(
  supabase: DbClient,
  orderId: string,
  productId: string,
  customerEmail?: string,
): Promise<SupplierFulfillment> {
  const productResult = await supabase
    .from('products')
    .select('supplier_id, supplier_sku, requires_email_activation')
    .eq('id', productId)
    .maybeSingle();
  if (productResult.error || !productResult.data) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404);
  }
  const product = productResult.data as {
    supplier_id: string | null;
    supplier_sku: string | null;
    requires_email_activation: boolean | null;
  };
  if (!product.supplier_id || !product.supplier_sku) {
    throw new AppError('SUPPLIER_NOT_LINKED', 'Product is not linked to a supplier', 400);
  }
  const needsEmail = product.requires_email_activation === true;
  if (needsEmail && !customerEmail) {
    throw new SupplierError('EMAIL_REQUIRED', 'This product requires an email address', 400);
  }
  const priceResult = await supabase
    .from('products')
    .select('supplier_price_minor')
    .eq('id', productId)
    .maybeSingle();
  const priceMinor = (priceResult.data as { supplier_price_minor?: string | number | null } | null)?.supplier_price_minor;
  const client = await loadSupplierClient(supabase, product.supplier_id);
  let observedBalance: number | null = null;
  try {
    const balance = await client.getBalance();
    observedBalance = balance.balance;
    await supabase
      .from('suppliers')
      .update({
        balance_usdt: balance.balance,
        balance_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', product.supplier_id);
    if (priceMinor !== null && priceMinor !== undefined) {
      const needed = Number(priceMinor) / 1_000_000;
      if (balance.balance < needed) {
        throw new SupplierError(
          'INSUFFICIENT_SUPPLIER_BALANCE',
          `Low supplier balance (${balance.balance} USDT). Need ${needed} USDT. Top up ProdSeller wallet.`,
          402,
        );
      }
    }
  } catch (error: unknown) {
    if (error instanceof SupplierError && error.code === 'INSUFFICIENT_SUPPLIER_BALANCE') {
      throw error;
    }
    logger.warn('supplier balance check failed, placing order anyway', {
      orderId,
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
  const placed = await client.createOrder({
    productId: product.supplier_sku,
    quantity: 1,
    idempotencyKey: orderId,
    ...(customerEmail ? { email: customerEmail } : {}),
  });
  if (observedBalance !== null) {
    const next = Math.max(0, observedBalance - placed.amount);
    await supabase
      .from('suppliers')
      .update({ balance_usdt: next, updated_at: new Date().toISOString() })
      .eq('id', product.supplier_id);
  }
  return mapSupplierOrder(placed);
}

const SUPPLIER_ORDER_PREFIX = 'supplier_order:';

export function supplierArtifact(supplierOrderId: string): string {
  return `${SUPPLIER_ORDER_PREFIX}${supplierOrderId}`;
}

export function supplierOrderIdFromArtifact(artifactPath: string | null | undefined): string | null {
  if (!artifactPath?.startsWith(SUPPLIER_ORDER_PREFIX)) {
    return null;
  }
  return artifactPath.slice(SUPPLIER_ORDER_PREFIX.length);
}

export async function orderCustomerEmail(supabase: DbClient, orderId: string): Promise<string | undefined> {
  const { data } = await supabase.from('orders').select('metadata').eq('id', orderId).maybeSingle();
  const metadata = (data as { metadata?: { customerEmail?: string } } | null)?.metadata;
  return metadata?.customerEmail;
}

export function supplierCostMinor(value: string | number): bigint {
  const text = typeof value === 'number' ? value.toFixed(6) : value;
  return usdtToMinor(text);
}
