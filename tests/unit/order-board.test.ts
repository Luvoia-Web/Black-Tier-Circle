import { describe, expect, it } from 'vitest';
import { AppError, ValidationError } from '@/lib/errors';
import { retryDelivery } from '@/modules/fulfillment';
import { canTransitionDelivery } from '@/modules/orders/state-machine';
import { parseOrderFilters } from '@/modules/platform/orders';
import { ownerReplace, replacementIdempotencyKey, type ReplacementPlaceInput } from '@/modules/platform/replacements';
import { readSupplierDesk } from '@/modules/platform/supplier-desk';
import { DEFAULT_STORE_CONFIG } from '@/modules/store-config/defaults';
import { layoutHomeButtons } from '@/modules/store-config/keyboard';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const ORDER = '00000000-0000-4000-8000-000000000901';
const CUSTOMER = '00000000-0000-4000-8000-000000000902';
const ACTOR = '00000000-0000-4000-8000-000000000903';
const PRODUCT = '00000000-0000-4000-8000-000000000906';

describe('order filters', () => {
  it('reads attention, chip, and range', () => {
    const filters = parseOrderFilters(new URLSearchParams('attention=delivery&chip=failed&range=7d&q=a.b'));
    expect(filters.attention).toBe('delivery');
    expect(filters.chip).toBe('failed');
    expect(filters.range).toBe('7d');
    expect(filters.search).toBe('ab');
  });

  it('ignores an unknown attention value', () => {
    expect(parseOrderFilters(new URLSearchParams('attention=nope')).attention).toBe('');
  });
});

function sentOrder() {
  return {
    id: ORDER,
    channel: 'owner_store',
    tenant_id: null,
    bot_id: null,
    customer_id: CUSTOMER,
    product_id: PRODUCT,
    product_version: 1,
    quantity: 1,
    quoted_retail_price: '3000000',
    quoted_wholesale_price: '2000000',
    currency: 'USDT',
    payment_method: 'wallet',
    external_order_ref: null,
    payment_status: 'verified',
    funding_status: 'debited',
    fulfillment_status: 'ready',
    delivery_status: 'sent',
    idempotency_key: 'checkout-1',
    metadata: { deliveryContent: 'old-key' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('owner replacement', () => {
  function db() {
    return createMemoryDb({
      orders: [sentOrder()],
      products: [{ id: PRODUCT, supplier_id: 'sup-1', supplier_sku: 'sku-1', title: 'Key' }],
      replacement_requests: [],
      order_events: [],
      audit_log: [],
      support_threads: [{ id: '00000000-0000-4000-8000-000000000904', customer_id: CUSTOMER, status: 'open', last_message_at: '2026-01-01T00:00:00.000Z' }],
      support_messages: [],
      fulfillment_attempts: [{ id: 'ful-1', order_id: ORDER, method: 'supplier', status: 'success', artifact_path: 'supplier_order:old' }],
      delivery_attempts: [{ id: 'del-1', fulfillment_id: 'ful-1', status: 'success', result: 'old-key' }],
    });
  }

  function placeOk(content = 'new-key') {
    const keys: string[] = [];
    return {
      keys,
      place: async (_db: unknown, input: ReplacementPlaceInput) => {
        keys.push(input.idempotencyKey);
        return { content, supplierOrderId: 'sup-order-9', costMinor: 1_000_000n };
      },
    };
  }

  it('buys a new supplier item, keeps the original delivery, audits the cost, and posts to the thread', async () => {
    const database = db();
    const placed = placeOk();
    const delivered: string[] = [];
    const result = await ownerReplace(database, { orderId: ORDER, actorId: ACTOR, mode: 'supplier', reason: 'File did not open' }, {
      place: placed.place,
      deliver: async (_db, item) => {
        delivered.push(item.content);
        expect(item.artifactPath).toBe('supplier_order:sup-order-9');
        expect(item.supplierCostMinor).toBe('1000000');
      },
    });
    expect(placed.keys).toEqual([replacementIdempotencyKey(ORDER, 1)]);
    expect(delivered).toEqual(['new-key']);
    expect(result.support).toBe('posted');
    expect(database.tables.replacement_requests?.[0]?.status).toBe('replaced');
    expect(database.tables.orders?.[0]?.delivery_status).toBe('sent');
    expect(database.tables.orders?.[0]?.metadata).toMatchObject({ deliveryContent: 'old-key' });
    expect(database.tables.delivery_attempts).toHaveLength(1);
    expect(database.tables.audit_log?.[0]).toMatchObject({ actor_id: ACTOR, action: 'order_replaced' });
    expect(database.tables.audit_log?.[0]?.after_val).toMatchObject({ supplierCostMinor: '1000000', replacementNumber: 1 });
    expect(database.tables.support_messages).toHaveLength(1);
  });

  it('sends a pasted item and does not place a supplier order', async () => {
    const database = db();
    const placed = placeOk();
    const delivered: string[] = [];
    await ownerReplace(database, { orderId: ORDER, actorId: ACTOR, mode: 'manual', content: 'fresh-key' }, {
      place: placed.place,
      deliver: async (_db, item) => {
        delivered.push(item.content);
        expect(item.method).toBe('manual');
      },
    });
    expect(placed.keys).toEqual([]);
    expect(delivered).toEqual(['fresh-key']);
    expect(database.tables.replacement_requests?.[0]?.status).toBe('replaced');
  });

  it('offers no supplier purchase when the product has no supplier', async () => {
    const database = db();
    if (database.tables.products?.[0]) database.tables.products[0].supplier_id = null;
    const placed = placeOk();
    await expect(ownerReplace(database, { orderId: ORDER, actorId: ACTOR, mode: 'supplier' }, { place: placed.place, deliver: async () => undefined })).rejects.toBeInstanceOf(ValidationError);
    expect(placed.keys).toEqual([]);
  });

  it('refuses a second open replacement', async () => {
    const database = db();
    database.tables.replacement_requests?.push({ id: '00000000-0000-4000-8000-000000000905', order_id: ORDER, status: 'approved' });
    await expect(ownerReplace(database, { orderId: ORDER, actorId: ACTOR, mode: 'manual', content: 'x' }, { deliver: async () => undefined })).rejects.toBeInstanceOf(ValidationError);
  });

  it('reuses the purchase when delivery fails after the supplier sold the item', async () => {
    const database = db();
    const placed = placeOk('bought-key');
    await expect(ownerReplace(database, { orderId: ORDER, actorId: ACTOR, mode: 'supplier' }, {
      place: placed.place,
      deliver: async () => {
        throw new ValidationError('REPLACEMENT_DELIVERY_FAILED', 'The replacement could not be sent to the buyer.');
      },
    })).rejects.toBeInstanceOf(ValidationError);
    const second: string[] = [];
    await ownerReplace(database, { orderId: ORDER, actorId: ACTOR, mode: 'supplier' }, {
      place: placed.place,
      deliver: async (_db, item) => {
        second.push(item.content);
        expect(item.artifactPath).toBe('supplier_order:sup-order-9');
      },
    });
    expect(placed.keys).toEqual([replacementIdempotencyKey(ORDER, 1)]);
    expect(second).toEqual(['bought-key']);
  });

  it('advances the replacement number after a definitive supplier failure', async () => {
    const database = db();
    const placed = placeOk();
    await expect(ownerReplace(database, { orderId: ORDER, actorId: ACTOR, mode: 'supplier' }, {
      place: async () => {
        throw new AppError('SUPPLIER_ORDER_FAILED', 'The supplier could not place this order.');
      },
      deliver: async () => undefined,
    })).rejects.toThrow(/could not place/);
    await ownerReplace(database, { orderId: ORDER, actorId: ACTOR, mode: 'supplier' }, {
      place: placed.place,
      deliver: async () => undefined,
    });
    expect(placed.keys).toEqual([replacementIdempotencyKey(ORDER, 2)]);
  });

  it('blocks a second purchase when the supplier outcome is unknown', async () => {
    const database = db();
    const placed = placeOk();
    await expect(ownerReplace(database, { orderId: ORDER, actorId: ACTOR, mode: 'supplier' }, {
      place: async () => {
        throw new Error('socket hang up');
      },
      deliver: async () => undefined,
    })).rejects.toThrow(/Reconcile/);
    await expect(ownerReplace(database, { orderId: ORDER, actorId: ACTOR, mode: 'supplier' }, {
      place: placed.place,
      deliver: async () => undefined,
    })).rejects.toThrow(/Reconcile/);
    expect(placed.keys).toEqual([]);
  });

  it('refuses a short supplier balance before another purchase', async () => {
    const database = db();
    await expect(ownerReplace(database, { orderId: ORDER, actorId: ACTOR, mode: 'supplier' }, {
      place: async () => {
        throw new ValidationError('INSUFFICIENT_SUPPLIER_BALANCE', 'Supplier balance is 0.4 USDT. A replacement needs 1 USDT. The buyer was not charged.');
      },
      deliver: async () => undefined,
    })).rejects.toThrow(/buyer was not charged/);
    expect(database.tables.replacement_requests?.[0]?.status).toBe('rejected');
    expect(database.tables.orders?.[0]?.delivery_status).toBe('sent');
  });
});

describe('normal delivery retry', () => {
  it('refuses a sent order', async () => {
    expect(canTransitionDelivery('sent', 'retry_pending')).toBe(false);
    const database = createMemoryDb({ orders: [sentOrder()] });
    await expect(retryDelivery(database, ORDER)).rejects.toThrow(/cannot be re-delivered/);
    expect(database.tables.orders?.[0]?.delivery_status).toBe('sent');
  });
});

describe('supplier health', () => {
  it('rates each supplier from its own attempts', async () => {
    const database = createMemoryDb({
      suppliers: [
        { id: 'sup-a', name: 'Alpha', status: 'active', balance_usdt: '3', last_sync_at: null, last_sync_error: null },
        { id: 'sup-b', name: 'Beta', status: 'active', balance_usdt: '9', last_sync_at: null, last_sync_error: null },
      ],
      products: [
        { id: 'prod-a', supplier_id: 'sup-a' },
        { id: 'prod-b', supplier_id: 'sup-b' },
      ],
      orders: [
        { id: 'order-a', product_id: 'prod-a', fulfillment_status: 'ready' },
        { id: 'order-b', product_id: 'prod-b', fulfillment_status: 'failed' },
      ],
      fulfillment_attempts: [
        { id: 'a1', order_id: 'order-a', method: 'supplier', status: 'success', error: null, started_at: '2026-01-01T00:00:00.000Z', completed_at: '2026-01-01T00:02:00.000Z' },
        { id: 'b1', order_id: 'order-b', method: 'supplier', status: 'failed', error: 'down', started_at: '2026-01-01T00:00:00.000Z', completed_at: '2026-01-01T00:10:00.000Z' },
      ],
    });
    const desk = await readSupplierDesk(database);
    const alpha = desk.health.find((row) => row.supplierId === 'sup-a');
    const beta = desk.health.find((row) => row.supplierId === 'sup-b');
    expect(alpha?.errorRate).toBe(0);
    expect(alpha?.averageMinutes).toBe(2);
    expect(beta?.errorRate).toBe(100);
    expect(beta?.averageMinutes).toBe(10);
    expect(desk.note).toMatch(/Balance history updates/i);
    expect(desk.note).not.toMatch(/supplier_balance_snapshots/);
  });
});

describe('buyer replace button', () => {
  it('stays off the home keyboard even when the stored button is enabled', () => {
    const rows = layoutHomeButtons(
      {
        ...DEFAULT_STORE_CONFIG,
        buttons: {
          ...DEFAULT_STORE_CONFIG.buttons,
          replace: { ...DEFAULT_STORE_CONFIG.buttons.replace, enabled: true },
        },
      },
      { resellerSignupEnabled: false },
    );
    expect(rows.flat().some((button) => button.text.includes('Replace') || ('data' in button && button.data === 'replace:'))).toBe(false);
  });
});
