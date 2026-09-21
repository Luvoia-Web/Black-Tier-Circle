/**
 * @file tests/unit/fulfillment.test.ts
 *
 * Unit tests for fulfillment routing, file/manual delivery, retries, and cancellation.
 *
 * @module Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { FULFILLMENT_CONFIG } from '@/lib/fulfillment-config';
import { attachAsset } from '@/modules/catalog';
import * as fulfillment from '@/modules/fulfillment';
import { cancelOrder, createOrder, getOrder } from '@/modules/orders';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

vi.mock('@/integrations/telegram/delivery', () => ({
  sendFileDelivery: vi.fn().mockResolvedValue(undefined),
  sendTextDelivery: vi.fn().mockResolvedValue(undefined),
  sendSupplierDelivery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/owner-bot', async () => {
  const actual = await vi.importActual<typeof import('@/lib/owner-bot')>('@/lib/owner-bot');
  return {
    ...actual,
    getOwnerBotToken: () => 'test-owner-bot-token',
    isOwnerBotConfigured: () => true,
  };
});

const TENANT_ID = '00000000-0000-4000-8000-000000000010';
const WALLET_ID = '00000000-0000-4000-8000-000000000020';
const FILE_PRODUCT_ID = '00000000-0000-4000-8000-000000000101';
const MANUAL_PRODUCT_ID = '00000000-0000-4000-8000-000000000102';
const SUPPLIER_PRODUCT_ID = '00000000-0000-4000-8000-000000000103';
const BOT_ID = '00000000-0000-4000-8000-000000000201';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000301';
const ACTOR_ID = '00000000-0000-4000-8000-000000000001';

function productRow(id: string, deliveryType: string) {
  return {
    id,
    sku: `SKU-${id.slice(-3)}`,
    title: `Product ${deliveryType}`,
    description: 'Synthetic test product',
    category: 'ebooks',
    delivery_type: deliveryType,
    status: 'published',
    wholesale_price: '5000000',
    retail_price: '10000000',
    stock_unlimited: true,
    stock_count: null,
    reseller_eligible: true,
    max_purchase_qty: 1,
    estimated_delivery_minutes: 15,
    version: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function seedDb() {
  return createMemoryDb({
    tenants: [
      {
        id: TENANT_ID,
        owner_user_id: '00000000-0000-4000-8000-000000000002',
        display_name: 'Sandbox Reseller',
        business_name: null,
        support_contact: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    products: [
      productRow(FILE_PRODUCT_ID, 'file_reusable'),
      productRow(MANUAL_PRODUCT_ID, 'manual'),
      productRow(SUPPLIER_PRODUCT_ID, 'supplier_api'),
    ],
    reseller_listings: [
      {
        id: '00000000-0000-4000-8000-000000000401',
        tenant_id: TENANT_ID,
        product_id: FILE_PRODUCT_ID,
        retail_price: '12000000',
        is_visible: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000402',
        tenant_id: TENANT_ID,
        product_id: MANUAL_PRODUCT_ID,
        retail_price: '12000000',
        is_visible: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    wallets: [
      {
        id: WALLET_ID,
        tenant_id: TENANT_ID,
        balance_total: '20000000',
        balance_reserved: '0',
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
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
}

async function attachMainFile(db: ReturnType<typeof createMemoryDb>, productId: string): Promise<void> {
  await attachAsset(db, productId, {
    storagePath: `products/${productId}/file.pdf`,
    contentType: 'application/pdf',
    fileSizeBytes: 128,
    isPreview: false,
  });
  await attachAsset(db, productId, {
    storagePath: `products/${productId}/preview.png`,
    contentType: 'image/png',
    fileSizeBytes: 32,
    isPreview: true,
  });
}

beforeEach(async () => {
  const delivery = await import('@/integrations/telegram/delivery');
  vi.mocked(delivery.sendFileDelivery).mockResolvedValue(undefined);
  vi.mocked(delivery.sendTextDelivery).mockResolvedValue(undefined);
});

describe('routing', () => {
  it("processQueuedOrder with delivery_type='file_reusable' calls fulfillFile", async () => {
    const db = seedDb();
    await attachMainFile(db, FILE_PRODUCT_ID);
    const delivery = await import('@/integrations/telegram/delivery');
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: FILE_PRODUCT_ID,
      idempotencyKey: 'file-route',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('ready');
    expect(delivery.sendFileDelivery).toHaveBeenCalled();
    expect(db.tables.fulfillment_attempts?.[0]?.method).toBe('file');
  });

  it("processQueuedOrder with delivery_type='manual' calls fulfillManual", async () => {
    const db = seedDb();
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: MANUAL_PRODUCT_ID,
      idempotencyKey: 'manual-route',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('manual_pending');
    expect(db.tables.fulfillment_attempts?.[0]?.method).toBe('manual');
  });

  it("processQueuedOrder with delivery_type='supplier_api' calls fulfillSupplier", async () => {
    const db = seedDb();
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: SUPPLIER_PRODUCT_ID,
      idempotencyKey: 'supplier-route',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('ready');
    expect(db.tables.fulfillment_attempts?.[0]?.method).toBe('supplier');
  });

  it('processQueuedOrder with fulfillment_status != queued throws AppError', async () => {
    const db = seedDb();
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: MANUAL_PRODUCT_ID,
      idempotencyKey: 'not-queued',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    await expect(fulfillment.processQueuedOrder(db, order.id)).rejects.toBeInstanceOf(AppError);
  });
});

describe('file fulfillment', () => {
  it('fulfillFile fetches non-preview asset and generates signed URL', async () => {
    const db = seedDb();
    await attachMainFile(db, FILE_PRODUCT_ID);
    const delivery = await import('@/integrations/telegram/delivery');
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: FILE_PRODUCT_ID,
      idempotencyKey: 'file-url',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    expect(delivery.sendFileDelivery).toHaveBeenCalled();
    const signedUrl = vi.mocked(delivery.sendFileDelivery).mock.calls[0]?.[2] ?? '';
    expect(signedUrl).toContain(`exp=${FULFILLMENT_CONFIG.downloadUrlExpirySeconds}`);
    expect(signedUrl).toContain('file.pdf');
  });

  it('fulfillFile calls deliverViaBot with signed URL', async () => {
    const db = seedDb();
    await attachMainFile(db, FILE_PRODUCT_ID);
    const delivery = await import('@/integrations/telegram/delivery');
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: FILE_PRODUCT_ID,
      idempotencyKey: 'file-deliver',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    expect(delivery.sendFileDelivery).toHaveBeenCalled();
    const signedUrl = vi.mocked(delivery.sendFileDelivery).mock.calls[0]?.[2] ?? '';
    expect(signedUrl).toContain('signed.example.test');
    expect(db.tables.delivery_attempts?.length).toBeGreaterThan(0);
  });

  it('On successful delivery: fulfillment → ready, delivery → sent', async () => {
    const db = seedDb();
    await attachMainFile(db, FILE_PRODUCT_ID);
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: FILE_PRODUCT_ID,
      idempotencyKey: 'file-success',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('ready');
    expect(latest.deliveryStatus).toBe('sent');
  });

  it('On delivery failure: delivery → retry_pending', async () => {
    const db = seedDb();
    await attachMainFile(db, FILE_PRODUCT_ID);
    const delivery = await import('@/integrations/telegram/delivery');
    vi.mocked(delivery.sendFileDelivery).mockRejectedValue(new Error('telegram down'));
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: FILE_PRODUCT_ID,
      idempotencyKey: 'file-fail',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('ready');
    expect(latest.deliveryStatus).toBe('retry_pending');
  });
});

describe('manual fulfillment', () => {
  it('fulfillManual transitions fulfillment → manual_pending', async () => {
    const db = seedDb();
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: MANUAL_PRODUCT_ID,
      idempotencyKey: 'manual-pending',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('manual_pending');
  });

  it('markManualFulfilled transitions fulfillment → ready and consumes reservation', async () => {
    const db = seedDb();
    const order = await createOrder(db, {
      channel: 'reseller_bot',
      tenantId: TENANT_ID,
      botId: BOT_ID,
      customerId: CUSTOMER_ID,
      productId: MANUAL_PRODUCT_ID,
      idempotencyKey: 'manual-complete',
    });
    expect(order.fundingStatus).toBe('reserved');
    await fulfillment.processQueuedOrder(db, order.id);
    await fulfillment.markManualFulfilled(db, order.id, ACTOR_ID, 'handed off');
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('ready');
    expect(latest.fundingStatus).toBe('debited');
    expect(db.tables.wallet_reservations?.[0]?.status).toBe('consumed');
  });
});

describe('retry', () => {
  it('retryDelivery after maxAttempts transitions delivery → unreachable', async () => {
    const db = seedDb();
    await attachMainFile(db, FILE_PRODUCT_ID);
    const delivery = await import('@/integrations/telegram/delivery');
    vi.mocked(delivery.sendFileDelivery).mockRejectedValue(new Error('telegram down'));
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: FILE_PRODUCT_ID,
      idempotencyKey: 'retry-max',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    for (let index = 1; index < FULFILLMENT_CONFIG.maxDeliveryAttempts; index += 1) {
      await fulfillment.retryDelivery(db, order.id);
    }
    const latest = await getOrder(db, order.id);
    expect(latest.deliveryStatus).toBe('unreachable');
  });

  it('retryDelivery below maxAttempts creates new delivery_attempt', async () => {
    const db = seedDb();
    await attachMainFile(db, FILE_PRODUCT_ID);
    const delivery = await import('@/integrations/telegram/delivery');
    vi.mocked(delivery.sendFileDelivery).mockRejectedValue(new Error('telegram down'));
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: FILE_PRODUCT_ID,
      idempotencyKey: 'retry-below',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    const before = db.tables.delivery_attempts?.length ?? 0;
    await fulfillment.retryDelivery(db, order.id);
    expect(db.tables.delivery_attempts?.length).toBe(before + 1);
  });
});

describe('cancellation', () => {
  it('cancelOrder with fulfilled order throws AppError (cannot cancel)', async () => {
    const db = seedDb();
    await attachMainFile(db, FILE_PRODUCT_ID);
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: FILE_PRODUCT_ID,
      idempotencyKey: 'cancel-fulfilled',
    });
    await fulfillment.processQueuedOrder(db, order.id);
    await expect(cancelOrder(db, order.id, 'too late')).rejects.toBeInstanceOf(AppError);
  });

  it('cancelOrder with unfulfilled order releases reservation', async () => {
    const db = seedDb();
    const order = await createOrder(db, {
      channel: 'reseller_bot',
      tenantId: TENANT_ID,
      botId: BOT_ID,
      customerId: CUSTOMER_ID,
      productId: FILE_PRODUCT_ID,
      idempotencyKey: 'cancel-open',
    });
    await cancelOrder(db, order.id, 'customer cancelled');
    expect(db.tables.wallet_reservations?.[0]?.status).toBe('released');
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('canceled');
  });
});
