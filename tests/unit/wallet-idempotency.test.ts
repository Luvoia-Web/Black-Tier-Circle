/**
 * One order, one wallet debit, one supplier purchase, even when pay and fulfill run together.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/supplier/place', () => ({
  fulfillViaSupplier: vi.fn(async () => ({
    supplierOrderId: 'sup-1',
    deliveryContent: 'KEY-1',
    requiresPolling: false,
    status: 'delivered' as const,
    amountUsdt: 1,
    activationEta: null,
  })),
  loadSupplierClient: vi.fn(),
  orderCustomerEmail: vi.fn(async () => undefined),
  supplierArtifact: (id: string) => `supplier_order:${id}`,
  supplierOrderIdFromArtifact: (value: string | null | undefined) =>
    typeof value === 'string' && value.startsWith('supplier_order:') ? value.slice('supplier_order:'.length) : null,
  supplierCostMinor: () => 0n,
}));

vi.mock('@/integrations/telegram/delivery', () => ({
  sendFileDelivery: vi.fn(async () => undefined),
  sendTextDelivery: vi.fn(async () => undefined),
  sendSupplierDelivery: vi.fn(async () => undefined),
  sendHtmlNotice: vi.fn(async () => undefined),
}));

vi.mock('@/modules/platform', () => ({
  getDecryptedOwnerBotToken: vi.fn(async () => '123456:test-token'),
}));

import { PaymentError } from '@/lib/errors';
import { openCheckoutOrder } from '@/modules/orders/checkout';
import { payOrderFromCustomerWallet, refundWalletPaymentOnce } from '@/modules/payments';
import { processQueuedOrder } from '@/modules/fulfillment';
import { deliveredOrderText, startInlineDelivery, takeInlineMessage } from '@/modules/fulfillment/customer-message';
import { sendTextDelivery } from '@/integrations/telegram/delivery';
import { fulfillViaSupplier } from '@/modules/supplier/place';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000101';
const FILE_PRODUCT_ID = '00000000-0000-4000-8000-000000000102';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000301';
const BOT_ID = '00000000-0000-4000-8000-000000000201';

function seedDb(balance = '50000000') {
  return createMemoryDb({
    products: [
      {
        id: PRODUCT_ID,
        sku: 'SUP-1',
        title: 'Instant Key',
        description: 'Test',
        category: 'Keys',
        delivery_type: 'supplier_api',
        status: 'published',
        wholesale_price: '1000000',
        retail_price: '10000000',
        stock_unlimited: true,
        stock_count: null,
        reseller_eligible: true,
        max_purchase_qty: 10,
        estimated_delivery_minutes: null,
        supplier_id: '00000000-0000-4000-8000-000000000901',
        supplier_sku: 'sku-1',
        supplier_price_minor: '1000000',
        version: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: FILE_PRODUCT_ID,
        sku: 'FILE-1',
        title: 'Missing File',
        description: 'Test',
        category: 'Files',
        delivery_type: 'file_reusable',
        status: 'published',
        wholesale_price: '1000000',
        retail_price: '10000000',
        stock_unlimited: true,
        stock_count: null,
        reseller_eligible: true,
        max_purchase_qty: 10,
        estimated_delivery_minutes: null,
        version: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    customers: [
      {
        id: CUSTOMER_ID,
        bot_id: BOT_ID,
        telegram_user_id: '42',
        telegram_chat_id: '42',
        first_name: 'Ada',
        username: 'ada',
        is_blocked: false,
        credit_balance: balance,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
}

beforeEach(() => {
  vi.mocked(fulfillViaSupplier).mockResolvedValue({
    supplierOrderId: 'sup-1',
    deliveryContent: 'KEY-1',
    requiresPolling: false,
    status: 'delivered',
    amountUsdt: 1,
    activationEta: null,
  });
});

describe('wallet payment idempotency', () => {
  it('charges and fulfills a single order once when five payments race', async () => {
    const db = seedDb();
    const order = await openCheckoutOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 1,
      idempotencyKey: 'ignored',
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        payOrderFromCustomerWallet(db, order.id, CUSTOMER_ID).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        ),
      ),
    );
    const paid = results.filter((result) => result.ok);
    const lost = results.filter((result) => !result.ok);
    expect(paid).toHaveLength(1);
    expect(lost).toHaveLength(4);
    for (const result of lost) {
      expect(result.error).toBeInstanceOf(PaymentError);
      expect((result.error as PaymentError).code).toBe('PAYMENT_IN_PROGRESS');
    }
    expect(db.tables.customers?.[0]?.credit_balance).toBe('40000000');
    const debits = (db.tables.customer_credit_entries ?? []).filter((row) => row.entry_type === 'debit');
    expect(debits).toHaveLength(1);

    startInlineDelivery(order.id);
    const fulfillments = await Promise.all(
      Array.from({ length: 5 }, () => processQueuedOrder(db, order.id)),
    );
    expect(vi.mocked(fulfillViaSupplier)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendTextDelivery)).not.toHaveBeenCalled();
    expect(db.tables.fulfillment_attempts).toHaveLength(1);
    expect(fulfillments.filter((result) => result.success)).not.toHaveLength(0);
    const message = takeInlineMessage(order.id);
    expect(message).toContain('Your order is delivered');
    expect(message).toContain('KEY-1');
    expect(message).toContain('Quantity: 1');
  });

  it('formats the delivered message once', () => {
    const text = deliveredOrderText({
      title: 'Instant Key',
      quantity: 2,
      amountMinor: 20000000n,
      balanceMinor: 30000000n,
      orderId: 'abcdef1234567890',
      content: 'KEY-1',
    });
    expect(text).toContain('Your order is delivered');
    expect(text).toContain('Instant Key');
    expect(text).toContain('Quantity: 2');
    expect(text).toContain('KEY-1');
    expect(text).toContain('ABCDEF12');
  });

  it('reuses one open order when buy is tapped five times', async () => {
    const db = seedDb();
    const orders = await Promise.all(
      Array.from({ length: 5 }, () =>
        openCheckoutOrder(db, {
          channel: 'owner_store',
          botId: 'owner',
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          quantity: 1,
          idempotencyKey: `tap-${Math.random()}`,
        }),
      ),
    );
    expect(new Set(orders.map((order) => order.id)).size).toBe(1);
    expect(db.tables.orders).toHaveLength(1);
  });

  it('refunds a failed fulfillment once', async () => {
    const db = seedDb();
    const order = await openCheckoutOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: FILE_PRODUCT_ID,
      quantity: 1,
      idempotencyKey: 'file-fail',
    });
    await payOrderFromCustomerWallet(db, order.id, CUSTOMER_ID);
    expect(db.tables.customers?.[0]?.credit_balance).toBe('40000000');
    const result = await processQueuedOrder(db, order.id);
    expect(result.success).toBe(false);
    expect(db.tables.customers?.[0]?.credit_balance).toBe('50000000');
    const refunds = (db.tables.customer_credit_entries ?? []).filter((row) => row.entry_type === 'refund');
    expect(refunds).toHaveLength(1);
    const again = await refundWalletPaymentOnce(db, order.id, CUSTOMER_ID);
    expect(again).toBe('refunded');
    expect(db.tables.customers?.[0]?.credit_balance).toBe('50000000');
    expect((db.tables.customer_credit_entries ?? []).filter((row) => row.entry_type === 'refund')).toHaveLength(1);
  });
});
