/**
 * @file tests/unit/supplier.test.ts
 *
 * Unit tests for the supplier connector, fulfillment routing, and reconciliation.
 *
 * @module Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSupplierConnector,
  mapSupplierStatus,
} from '@/integrations/supplier/connector';
import { getSupplierModeLabel, hasActiveSupplier, SUPPLIER_CONFIG } from '@/lib/supplier-config';
import * as fulfillment from '@/modules/fulfillment';
import { createOrder, getOrder } from '@/modules/orders';
import { createFakeSupplierConnector } from '@/tests/fixtures/fake-supplier';
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

vi.mock('@/integrations/supplier/connector', async () => {
  const actual = await vi.importActual<typeof import('@/integrations/supplier/connector')>(
    '@/integrations/supplier/connector',
  );
  return {
    ...actual,
    getSupplierConnector: vi.fn(actual.getSupplierConnector),
  };
});

const TENANT_ID = '00000000-0000-4000-8000-000000000010';
const WALLET_ID = '00000000-0000-4000-8000-000000000020';
const SUPPLIER_PRODUCT_ID = '00000000-0000-4000-8000-000000000103';
const BOT_ID = '00000000-0000-4000-8000-000000000201';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000301';
const ACTOR_ID = '00000000-0000-4000-8000-000000000001';

function productRow() {
  return {
    id: SUPPLIER_PRODUCT_ID,
    sku: 'SUP-103',
    title: 'Supplier product',
    description: 'Synthetic test product',
    category: 'ebooks',
    delivery_type: 'supplier_api',
    status: 'published',
    wholesale_price: '5000000',
    retail_price: '10000000',
    stock_unlimited: true,
    stock_count: null,
    reseller_eligible: true,
    max_purchase_qty: 1,
    estimated_delivery_minutes: 15,
    supplier_sku: 'EXT-SKU-103',
    supplier_metadata: {},
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
    products: [productRow()],
    reseller_listings: [
      {
        id: '00000000-0000-4000-8000-000000000403',
        tenant_id: TENANT_ID,
        product_id: SUPPLIER_PRODUCT_ID,
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

async function resellerOrder(db: ReturnType<typeof createMemoryDb>, key: string) {
  return createOrder(db, {
    channel: 'reseller_bot',
    tenantId: TENANT_ID,
    botId: BOT_ID,
    customerId: CUSTOMER_ID,
    productId: SUPPLIER_PRODUCT_ID,
    idempotencyKey: key,
  });
}

beforeEach(() => {
  vi.mocked(getSupplierConnector).mockImplementation(() => createFakeSupplierConnector());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.mocked(getSupplierConnector).mockReset();
});

describe('SANDBOX CONNECTOR', () => {
  it("createOrder with normal ID returns status='completed' and deliveryData", async () => {
    const { getSupplierConnector: realFactory } = await vi.importActual<
      typeof import('@/integrations/supplier/connector')
    >('@/integrations/supplier/connector');
    const connector = realFactory();
    const result = await connector.createOrder({
      internalOrderId: 'ord-normal',
      supplierProductSku: 'SKU',
      quantity: 1,
    });
    expect(result.status).toBe('completed');
    expect(result.deliveryData).toBeTruthy();
  });

  it("createOrder with FAIL_ prefix returns status='failed'", async () => {
    const { getSupplierConnector: realFactory } = await vi.importActual<
      typeof import('@/integrations/supplier/connector')
    >('@/integrations/supplier/connector');
    const result = await realFactory().createOrder({
      internalOrderId: 'FAIL_order',
      supplierProductSku: 'SKU',
      quantity: 1,
    });
    expect(result.status).toBe('failed');
  });

  it("createOrder with UNKNOWN_ prefix returns status='unknown'", async () => {
    const { getSupplierConnector: realFactory } = await vi.importActual<
      typeof import('@/integrations/supplier/connector')
    >('@/integrations/supplier/connector');
    const result = await realFactory().createOrder({
      internalOrderId: 'UNKNOWN_order',
      supplierProductSku: 'SKU',
      quantity: 1,
    });
    expect(result.status).toBe('unknown');
  });

  it("getOrderStatus with UNKNOWN supplier ref returns status='unknown'", async () => {
    const { getSupplierConnector: realFactory } = await vi.importActual<
      typeof import('@/integrations/supplier/connector')
    >('@/integrations/supplier/connector');
    const result = await realFactory().getOrderStatus('SANDBOX_UNKNOWN_abc');
    expect(result.status).toBe('unknown');
  });

  it('healthCheck returns true in sandbox', async () => {
    const { getSupplierConnector: realFactory } = await vi.importActual<
      typeof import('@/integrations/supplier/connector')
    >('@/integrations/supplier/connector');
    await expect(realFactory().healthCheck()).resolves.toBe(true);
  });
});

describe('FACTORY', () => {
  it('getSupplierConnector() returns sandbox when ACTIVE_SUPPLIER=sandbox', async () => {
    vi.stubEnv('ACTIVE_SUPPLIER', 'sandbox');
    vi.stubEnv('SUPPLIER_1_API_KEY', 'PLACEHOLDER_SUPPLIER_1_KEY');
    const { getSupplierConnector: realFactory } = await vi.importActual<
      typeof import('@/integrations/supplier/connector')
    >('@/integrations/supplier/connector');
    const result = await realFactory().createOrder({
      internalOrderId: 'ord-1',
      supplierProductSku: 'SKU',
      quantity: 1,
    });
    expect(result.supplierOrderId.startsWith('SANDBOX_')).toBe(true);
  });

  it('getSupplierConnector() returns real client when ACTIVE_SUPPLIER=supplier_1 (with mock fetch)', async () => {
    vi.stubEnv('ACTIVE_SUPPLIER', 'supplier_1');
    vi.stubEnv('SUPPLIER_1_API_KEY', 'real-key-not-placeholder');
    vi.stubEnv('SUPPLIER_1_BASE_URL', 'https://supplier.test');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        order_id: 'sup-99',
        status: 'completed',
        download_url: 'https://cdn.example/file',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { getSupplierConnector: realFactory } = await vi.importActual<
      typeof import('@/integrations/supplier/connector')
    >('@/integrations/supplier/connector');
    const result = await realFactory().createOrder({
      internalOrderId: 'ord-live',
      supplierProductSku: 'SKU',
      quantity: 1,
    });
    expect(result.supplierOrderId).toBe('sup-99');
    expect(result.status).toBe('completed');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('hasActiveSupplier() returns false in sandbox mode', () => {
    vi.stubEnv('ACTIVE_SUPPLIER', 'sandbox');
    expect(hasActiveSupplier()).toBe(false);
  });
});

describe('STATUS MAPPING', () => {
  it("mapSupplierStatus('completed') → 'completed'", () => {
    expect(mapSupplierStatus('completed')).toBe('completed');
  });

  it("mapSupplierStatus('COMPLETED') → 'completed' (case insensitive)", () => {
    expect(mapSupplierStatus('COMPLETED')).toBe('completed');
  });

  it("mapSupplierStatus('fulfilled') → 'completed'", () => {
    expect(mapSupplierStatus('fulfilled')).toBe('completed');
  });

  it("mapSupplierStatus('in_progress') → 'processing'", () => {
    expect(mapSupplierStatus('in_progress')).toBe('processing');
  });

  it("mapSupplierStatus('garbage') → 'unknown'", () => {
    expect(mapSupplierStatus('garbage')).toBe('unknown');
  });
});

describe('FULFILLMENT ROUTING', () => {
  it("fulfillSupplier called for delivery_type='supplier_api' orders", async () => {
    const db = seedDb();
    const order = await resellerOrder(db, 'supplier-route');
    await fulfillment.processQueuedOrder(db, order.id);
    expect(db.tables.fulfillment_attempts?.[0]?.method).toBe('supplier');
  });

  it("On completed: consumeReservation called, fulfillment → 'ready'", async () => {
    vi.mocked(getSupplierConnector).mockReturnValue(
      createFakeSupplierConnector({
        createOrder: async (input) => ({
          supplierOrderId: `OK_${input.internalOrderId}`,
          status: 'completed',
          deliveryData: 'https://files.example/ok',
          message: 'done',
          completedAt: new Date(),
        }),
      }),
    );
    const db = seedDb();
    const order = await resellerOrder(db, 'supplier-ok');
    expect(order.fundingStatus).toBe('reserved');
    await fulfillment.processQueuedOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('ready');
    expect(latest.fundingStatus).toBe('debited');
    expect(db.tables.wallet_reservations?.[0]?.status).toBe('consumed');
  });

  it("On failed: releaseReservation called, fulfillment → 'failed'", async () => {
    vi.mocked(getSupplierConnector).mockReturnValue(
      createFakeSupplierConnector({
        createOrder: async (input) => ({
          supplierOrderId: `FAIL_${input.internalOrderId}`,
          status: 'failed',
          deliveryData: null,
          message: 'rejected',
          completedAt: null,
        }),
      }),
    );
    const db = seedDb();
    const order = await resellerOrder(db, 'supplier-fail');
    await fulfillment.processQueuedOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('failed');
    expect(latest.fundingStatus).toBe('released');
    expect(db.tables.wallet_reservations?.[0]?.status).toBe('released');
  });

  it("On unknown: neither consume nor release, fulfillment → 'outcome_unknown'", async () => {
    vi.mocked(getSupplierConnector).mockReturnValue(
      createFakeSupplierConnector({
        createOrder: async (input) => ({
          supplierOrderId: `UNKNOWN_${input.internalOrderId}`,
          status: 'unknown',
          deliveryData: null,
          message: 'pending',
          completedAt: null,
        }),
      }),
    );
    const db = seedDb();
    const order = await resellerOrder(db, 'supplier-unknown');
    await fulfillment.processQueuedOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('outcome_unknown');
    expect(latest.fundingStatus).toBe('reserved');
    expect(db.tables.wallet_reservations?.[0]?.status).toBe('active');
  });

  it("On timeout: fulfillment → 'outcome_unknown', reservation kept", async () => {
    vi.mocked(getSupplierConnector).mockReturnValue(
      createFakeSupplierConnector({
        createOrder: async () => {
          throw new Error('Supplier request timed out');
        },
      }),
    );
    const db = seedDb();
    const order = await resellerOrder(db, 'supplier-timeout');
    await fulfillment.processQueuedOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('outcome_unknown');
    expect(latest.fundingStatus).toBe('reserved');
  });
});

describe('RECONCILIATION', () => {
  async function unknownOrder(db: ReturnType<typeof createMemoryDb>, key: string) {
    vi.mocked(getSupplierConnector).mockReturnValue(
      createFakeSupplierConnector({
        createOrder: async (input) => ({
          supplierOrderId: `UNKNOWN_${input.internalOrderId}`,
          status: 'unknown',
          deliveryData: null,
          message: 'pending',
          completedAt: null,
        }),
      }),
    );
    const order = await resellerOrder(db, key);
    await fulfillment.processQueuedOrder(db, order.id);
    return getOrder(db, order.id);
  }

  it('reconcile completed order: consumes reservation, delivers content', async () => {
    const db = seedDb();
    const order = await unknownOrder(db, 'recon-ok');
    vi.mocked(getSupplierConnector).mockReturnValue(
      createFakeSupplierConnector({
        getOrderStatus: async (supplierOrderId) => ({
          supplierOrderId,
          status: 'completed',
          deliveryData: 'LICENSE-KEY-1',
          message: 'done',
          completedAt: new Date(),
        }),
      }),
    );
    await fulfillment.reconcileSupplierOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('ready');
    expect(latest.fundingStatus).toBe('debited');
    const delivery = await import('@/integrations/telegram/delivery');
    expect(delivery.sendSupplierDelivery).toHaveBeenCalled();
  });

  it('reconcile failed order: releases reservation', async () => {
    const db = seedDb();
    const order = await unknownOrder(db, 'recon-fail');
    vi.mocked(getSupplierConnector).mockReturnValue(
      createFakeSupplierConnector({
        getOrderStatus: async (supplierOrderId) => ({
          supplierOrderId,
          status: 'failed',
          deliveryData: null,
          message: 'gone',
          completedAt: null,
        }),
      }),
    );
    await fulfillment.reconcileSupplierOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('failed');
    expect(latest.fundingStatus).toBe('released');
  });

  it('reconcile still-unknown order: no state change', async () => {
    const db = seedDb();
    const order = await unknownOrder(db, 'recon-still');
    vi.mocked(getSupplierConnector).mockReturnValue(
      createFakeSupplierConnector({
        getOrderStatus: async (supplierOrderId) => ({
          supplierOrderId,
          status: 'unknown',
          deliveryData: null,
          message: null,
          completedAt: null,
        }),
      }),
    );
    await fulfillment.reconcileSupplierOrder(db, order.id);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('outcome_unknown');
    expect(latest.fundingStatus).toBe('reserved');
  });

  it('reconcile old unknown order: escalation note added to order_events', async () => {
    const db = seedDb();
    const order = await unknownOrder(db, 'recon-old');
    for (const event of db.tables.order_events ?? []) {
      if (String(event.to_status) === 'outcome_unknown') {
        event.created_at = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      }
    }
    vi.mocked(getSupplierConnector).mockReturnValue(
      createFakeSupplierConnector({
        getOrderStatus: async (supplierOrderId) => ({
          supplierOrderId,
          status: 'processing',
          deliveryData: null,
          message: null,
          completedAt: null,
        }),
      }),
    );
    await fulfillment.reconcileSupplierOrder(db, order.id);
    const notes = (db.tables.order_events ?? []).map((row) => String(row.note ?? ''));
    expect(notes.some((note) => note.includes('owner escalation'))).toBe(true);
    const latest = await getOrder(db, order.id);
    expect(latest.fulfillmentStatus).toBe('outcome_unknown');
  });
});

describe('SUPPLIER CONFIG', () => {
  it("SUPPLIER_CONFIG.activeSupplier returns 'sandbox' with PLACEHOLDER_ key", () => {
    vi.stubEnv('ACTIVE_SUPPLIER', 'supplier_1');
    vi.stubEnv('SUPPLIER_1_API_KEY', 'PLACEHOLDER_SUPPLIER_1_KEY');
    expect(SUPPLIER_CONFIG.activeSupplier).toBe('sandbox');
  });

  it("getSupplierModeLabel() returns string containing 'Demo' in sandbox", () => {
    vi.stubEnv('ACTIVE_SUPPLIER', 'sandbox');
    expect(getSupplierModeLabel()).toContain('Demo');
  });
});
