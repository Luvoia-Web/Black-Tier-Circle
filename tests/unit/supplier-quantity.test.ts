/**
 * A supplier order uses the buyer's quantity.
 * A short delivery fails the whole order and refunds the wallet.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendHtmlNotice, sendTextDelivery } from '@/integrations/telegram/delivery';
import { SupplierError } from '@/integrations/prodseller/client';
import { payOrderFromCustomerWallet } from '@/modules/payments';
import { processQueuedOrder } from '@/modules/fulfillment';
import { openCheckoutOrder } from '@/modules/orders/checkout';
import { fulfillViaSupplier } from '@/modules/supplier/place';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';
import { encrypt } from '@/lib/encryption';

const { getBalance, createOrder } = vi.hoisted(() => ({
  getBalance: vi.fn(),
  createOrder: vi.fn(),
}));

vi.mock('@/integrations/prodseller/client', () => {
  class MockSupplierError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(code: string, message: string, status: number) {
      super(message);
      this.name = 'SupplierError';
      this.code = code;
      this.status = status;
    }
  }
  return {
    SupplierError: MockSupplierError,
    createProdSellerClient: () => ({ getBalance, createOrder }),
  };
});

vi.mock('@/integrations/telegram/delivery', () => ({
  sendFileDelivery: vi.fn(async () => undefined),
  sendTextDelivery: vi.fn(async () => undefined),
  sendSupplierDelivery: vi.fn(async () => undefined),
  sendHtmlNotice: vi.fn(async () => undefined),
}));

vi.mock('@/modules/platform', () => ({
  getDecryptedOwnerBotToken: vi.fn(async () => '123456:test-token'),
}));

const PRODUCT_ID = '00000000-0000-4000-8000-000000000101';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000301';
const SUPPLIER_ID = '00000000-0000-4000-8000-000000000901';

function seedDb() {
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
        supplier_id: SUPPLIER_ID,
        supplier_sku: 'sku-1',
        supplier_price_minor: '1000000',
        version: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    suppliers: [
      {
        id: SUPPLIER_ID,
        name: 'ProdSeller',
        slug: 'prodseller',
        base_url: 'https://prodseller.com/v1',
        api_key_encrypted: encrypt('psk_test'),
        auth_header_name: 'X-API-Key',
        status: 'active',
        adapter_name: 'prodseller',
        balance_usdt: 0,
      },
    ],
    customers: [
      {
        id: CUSTOMER_ID,
        bot_id: null,
        telegram_user_id: '42',
        telegram_chat_id: '42',
        first_name: 'Ada',
        username: 'ada',
        is_blocked: false,
        credit_balance: '50000000',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    platform_settings: [{ owner_bot_id: '999', support_telegram: '999' }],
  });
}

function delivered(keys: readonly string[]) {
  return {
    orderId: 'sup-1',
    status: 'delivered' as const,
    product: { id: 'sku-1', name: 'Instant Key' },
    quantity: keys.length,
    amount: keys.length,
    deliveredKeys: keys,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  getBalance.mockReset();
  createOrder.mockReset();
  vi.mocked(sendHtmlNotice).mockClear();
  vi.mocked(sendTextDelivery).mockClear();
  getBalance.mockResolvedValue({ telegramId: 1, username: 'supplier', balance: 10, membership: 'basic' });
  createOrder.mockResolvedValue(delivered(['k1', 'k2', 'k3']));
});

describe('supplier quantity', () => {
  it('places a supplier order for the quantity the buyer paid', async () => {
    const db = seedDb();
    const placed = await fulfillViaSupplier(db, 'order-3', PRODUCT_ID, 3);
    expect(createOrder).toHaveBeenCalledWith({
      productId: 'sku-1',
      quantity: 3,
      idempotencyKey: 'order-3',
    });
    expect(placed.deliveredCount).toBe(3);
  });

  it('fails a short delivery, refunds the wallet, and sends nothing', async () => {
    createOrder.mockResolvedValue(delivered(['k1', 'k2']));
    const db = seedDb();
    const order = await openCheckoutOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 3,
      idempotencyKey: 'qty-3',
    });
    await payOrderFromCustomerWallet(db, order.id, CUSTOMER_ID);
    expect(db.tables.customers?.[0]?.credit_balance).toBe('20000000');

    const result = await processQueuedOrder(db, order.id);

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'sku-1', quantity: 3, idempotencyKey: order.id }),
    );
    expect(result.success).toBe(false);
    expect(vi.mocked(sendTextDelivery)).not.toHaveBeenCalled();
    const latest = db.tables.orders?.find((row) => row.id === order.id);
    expect(latest?.fulfillment_status).not.toBe('ready');
    expect(latest?.delivery_status).not.toBe('sent');
    expect(latest?.payment_status).toBe('refunded');
    expect(db.tables.customers?.[0]?.credit_balance).toBe('50000000');
    const notices = vi.mocked(sendHtmlNotice).mock.calls.map((call) => String(call[2]));
    expect(notices.some((text) => text.includes('delivered 2 of 3'))).toBe(true);
  });

  it('blocks the purchase when the supplier balance covers one unit but not three', async () => {
    getBalance.mockResolvedValue({ telegramId: 1, username: 'supplier', balance: 1.5, membership: 'basic' });
    const db = seedDb();
    await expect(fulfillViaSupplier(db, 'order-3', PRODUCT_ID, 3)).rejects.toMatchObject({
      code: 'INSUFFICIENT_SUPPLIER_BALANCE',
    });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('tells the buyer the wallet money was returned when the supplier is out of stock', async () => {
    createOrder.mockRejectedValue(new SupplierError('OUT_OF_STOCK', 'none left', 409));
    const db = seedDb();
    const order = await openCheckoutOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 1,
      idempotencyKey: 'oos',
    });
    await payOrderFromCustomerWallet(db, order.id, CUSTOMER_ID);
    await processQueuedOrder(db, order.id);
    const notices = vi.mocked(sendHtmlNotice).mock.calls.map((call) => String(call[2]));
    expect(notices.some((text) => text.includes('returned to your wallet balance'))).toBe(true);
    expect(notices.some((text) => text.includes('NOT been deducted'))).toBe(false);
  });
});
