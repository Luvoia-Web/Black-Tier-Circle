/**
 * @file tests/unit/orders.test.ts
 *
 * Unit tests for order creation, cancellation, and the four-track state machine.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { AppError, NotFoundError } from '@/lib/errors';
import {
  canTransitionFulfillment,
  canTransitionPayment,
  cancelOrder,
  createOrder,
  recordTransition,
} from '@/modules/orders';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const TENANT_ID = '00000000-0000-4000-8000-000000000010';
const WALLET_ID = '00000000-0000-4000-8000-000000000020';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000101';
const BOT_ID = '00000000-0000-4000-8000-000000000201';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000301';

function seedOrderDb() {
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
      {
        id: PRODUCT_ID,
        sku: 'EBOOK-DEMO-001',
        title: 'Demo Ebook',
        description: 'Synthetic test product',
        category: 'ebooks',
        delivery_type: 'file_reusable',
        status: 'published',
        wholesale_price: '5000000',
        retail_price: '10000000',
        stock_unlimited: true,
        stock_count: null,
        reseller_eligible: true,
        max_purchase_qty: 1,
        estimated_delivery_minutes: null,
        version: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    reseller_listings: [
      {
        id: '00000000-0000-4000-8000-000000000401',
        tenant_id: TENANT_ID,
        product_id: PRODUCT_ID,
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

describe('createOrder', () => {
  it('throws NotFoundError for a non-existent product', async () => {
    const db = seedOrderDb();
    await expect(
      createOrder(db, {
        channel: 'owner_store',
        botId: 'owner',
        customerId: CUSTOMER_ID,
        productId: '00000000-0000-4000-8000-000000000999',
        idempotencyKey: 'missing-product',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the existing order for the same idempotency key', async () => {
    const db = seedOrderDb();
    const input = {
      channel: 'reseller_bot' as const,
      tenantId: TENANT_ID,
      botId: BOT_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      idempotencyKey: 'tg:bot:1:product',
    };
    const first = await createOrder(db, input);
    const second = await createOrder(db, input);
    expect(second.id).toBe(first.id);
    expect(db.tables.orders).toHaveLength(1);
  });

  it('throws TENANT_NOT_ACTIVE for a pending reseller tenant', async () => {
    const db = seedOrderDb();
    const tenants = db.tables.tenants ?? [];
    const tenant = tenants[0];
    if (tenant) {
      tenant.status = 'pending';
    }
    await expect(
      createOrder(db, {
        channel: 'reseller_bot',
        tenantId: TENANT_ID,
        botId: BOT_ID,
        customerId: CUSTOMER_ID,
        productId: PRODUCT_ID,
        idempotencyKey: 'pending-tenant',
      }),
    ).rejects.toMatchObject({ code: 'TENANT_NOT_ACTIVE' });
  });
});

describe('cancelOrder', () => {
  it('releases a wallet reservation when funding_status is reserved', async () => {
    const db = seedOrderDb();
    const order = await createOrder(db, {
      channel: 'reseller_bot',
      tenantId: TENANT_ID,
      botId: BOT_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      idempotencyKey: 'tg:bot:2:product',
    });
    expect(order.fundingStatus).toBe('reserved');
    const reservations = db.tables.wallet_reservations ?? [];
    expect(reservations[0]?.status).toBe('active');
    await cancelOrder(db, order.id, 'customer cancelled');
    expect(reservations[0]?.status).toBe('released');
  });
});

describe('state machine', () => {
  it('valid transition returns true', () => {
    expect(canTransitionPayment('awaiting', 'pending_verification')).toBe(true);
  });

  it('invalid transition throws AppError', async () => {
    const db = seedOrderDb();
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      idempotencyKey: 'tg:owner:transition',
    });
    await expect(
      recordTransition(db, order.id, 'payment', 'verified', 'awaiting'),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("canTransitionPayment('awaiting', 'pending_verification') → true", () => {
    expect(canTransitionPayment('awaiting', 'pending_verification')).toBe(true);
  });

  it("canTransitionPayment('verified', 'awaiting') → false (cannot go backwards)", () => {
    expect(canTransitionPayment('verified', 'awaiting')).toBe(false);
  });

  it("canTransitionFulfillment('sent', 'queued') → false", () => {
    expect(canTransitionFulfillment('sent', 'queued')).toBe(false);
  });
});
