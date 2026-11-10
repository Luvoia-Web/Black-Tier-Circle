import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { createOrder, updateOrderQuantity } from '@/modules/orders';
import { payOrderFromCustomerWallet } from '@/modules/payments';
import {
  orderTotals,
  percentToHundredths,
  unitPriceForQuantity,
  unitPriceFromPercentOff,
  validateTiers,
} from '@/modules/pricing/tiers';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const TENANT_ID = '00000000-0000-4000-8000-000000000010';
const OTHER_TENANT = '00000000-0000-4000-8000-000000000011';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000101';
const BOT_ID = '00000000-0000-4000-8000-000000000201';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000301';

const BASE = 10_000_000n;
const WHOLESALE = 5_000_000n;
const TIER_3 = 8_000_000n;
const TIER_10 = 7_000_000n;

function seed(extra: Record<string, Record<string, unknown>[]> = {}) {
  return createMemoryDb({
    tenants: [
      {
        id: TENANT_ID,
        owner_user_id: '00000000-0000-4000-8000-000000000002',
        display_name: 'Sandbox',
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    products: [
      {
        id: PRODUCT_ID,
        sku: 'BULK-1',
        title: 'Bulk item',
        description: null,
        category: 'keys',
        delivery_type: 'manual',
        status: 'published',
        wholesale_price: WHOLESALE.toString(),
        retail_price: BASE.toString(),
        stock_unlimited: true,
        stock_count: null,
        reseller_eligible: true,
        max_purchase_qty: 50,
        estimated_delivery_minutes: null,
        version: 1,
        supplier_id: null,
        supplier_price_minor: null,
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
        id: '00000000-0000-4000-8000-000000000020',
        tenant_id: TENANT_ID,
        balance_total: '500000000',
        balance_reserved: '0',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    customers: [
      {
        id: CUSTOMER_ID,
        bot_id: null,
        telegram_user_id: '100',
        telegram_chat_id: '100',
        first_name: 'Ada',
        username: 'ada',
        is_blocked: false,
        credit_balance: '100000000',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    product_bulk_tiers: [
      {
        id: '00000000-0000-4000-8000-000000000501',
        product_id: PRODUCT_ID,
        tenant_id: null,
        min_qty: 3,
        unit_price_minor: TIER_3.toString(),
      },
      {
        id: '00000000-0000-4000-8000-000000000502',
        product_id: PRODUCT_ID,
        tenant_id: null,
        min_qty: 10,
        unit_price_minor: TIER_10.toString(),
      },
      {
        id: '00000000-0000-4000-8000-000000000503',
        product_id: PRODUCT_ID,
        tenant_id: TENANT_ID,
        min_qty: 3,
        unit_price_minor: '9000000',
      },
      {
        id: '00000000-0000-4000-8000-000000000504',
        product_id: PRODUCT_ID,
        tenant_id: OTHER_TENANT,
        min_qty: 3,
        unit_price_minor: '1000000',
      },
    ],
    ...extra,
  });
}

describe('bulk tier math', () => {
  const tiers = [
    { minQty: 3, unitPriceMinor: TIER_3 },
    { minQty: 10, unitPriceMinor: TIER_10 },
  ];

  it('prices every unit from the highest tier reached', () => {
    expect(unitPriceForQuantity(BASE, tiers, 1)).toBe(BASE);
    expect(unitPriceForQuantity(BASE, tiers, 2)).toBe(BASE);
    expect(unitPriceForQuantity(BASE, tiers, 3)).toBe(TIER_3);
    expect(unitPriceForQuantity(BASE, tiers, 9)).toBe(TIER_3);
    expect(unitPriceForQuantity(BASE, tiers, 10)).toBe(TIER_10);
    expect(unitPriceForQuantity(BASE, tiers, 50)).toBe(TIER_10);
    const atTen = orderTotals({ baseUnit: BASE, tiers, quantity: 10, wholesaleUnit: WHOLESALE });
    expect(atTen.quotedRetailMinor).toBe(TIER_10 * 10n);
    expect(atTen.quotedWholesaleMinor).toBe(WHOLESALE * 10n);
    expect(atTen.savingsMinor).toBe((BASE - TIER_10) * 10n);
    expect(orderTotals({ baseUnit: BASE, tiers: [], quantity: 4, wholesaleUnit: WHOLESALE }).quotedRetailMinor).toBe(BASE * 4n);
  });

  it('keeps large quantities exact in bigint', () => {
    const base = 9_000_000_000_000_000n;
    const unit = 8_000_000_000_000_000n;
    const totals = orderTotals({
      baseUnit: base,
      tiers: [{ minQty: 2, unitPriceMinor: unit }],
      quantity: 1000,
      wholesaleUnit: 1_000_000_000_000_000n,
    });
    expect(totals.quotedRetailMinor).toBe(unit * 1000n);
    expect(totals.quotedWholesaleMinor).toBe(1_000_000_000_000_000n * 1000n);
  });

  it('rejects a bad ladder and rounds percent-off down', () => {
    expect(validateTiers(BASE, WHOLESALE, tiers).tiers.map((tier) => tier.minQty)).toEqual([3, 10]);
    expect(validateTiers(BASE, WHOLESALE, [{ minQty: 3, unitPriceMinor: WHOLESALE }]).tiers).toHaveLength(1);
    expect(() => validateTiers(BASE, WHOLESALE, [{ minQty: 1, unitPriceMinor: TIER_3 }])).toThrow(ValidationError);
    expect(() => validateTiers(BASE, WHOLESALE, [{ minQty: 3, unitPriceMinor: BASE }])).toThrow(/regular price/);
    expect(() => validateTiers(BASE, WHOLESALE, [{ minQty: 3, unitPriceMinor: WHOLESALE - 1n }])).toThrow(/cost floor/);
    expect(() =>
      validateTiers(BASE, WHOLESALE, [
        { minQty: 3, unitPriceMinor: TIER_3 },
        { minQty: 3, unitPriceMinor: TIER_10 },
      ]),
    ).toThrow(/higher minimum/);
    expect(() =>
      validateTiers(BASE, WHOLESALE, [
        { minQty: 3, unitPriceMinor: TIER_10 },
        { minQty: 10, unitPriceMinor: TIER_3 },
      ]),
    ).toThrow(/less per item/);
    expect(() => validateTiers(BASE, WHOLESALE, Array.from({ length: 6 }, (_, index) => ({
      minQty: index + 2,
      unitPriceMinor: BASE - BigInt(index + 1) * 1000n,
    })))).toThrow(/5 tiers/);
    const unknown = validateTiers(BASE, null, [{ minQty: 2, unitPriceMinor: 1n }]);
    expect(unknown.floorKnown).toBe(false);
    expect(unknown.note).toMatch(/Cost is unknown/);
    expect(percentToHundredths('10')).toBe(1000n);
    expect(percentToHundredths('33.33')).toBe(3333n);
    expect(unitPriceFromPercentOff(BASE, 3333n)).toBe(6_667_000n);
    expect(unitPriceFromPercentOff(10_000_001n, 5000n)).toBe(5_000_000n);
  });

  it('ignores a tier that has fallen under the current floor', () => {
    expect(unitPriceForQuantity(BASE, [{ minQty: 2, unitPriceMinor: 1n }], 4, WHOLESALE)).toBe(BASE);
  });
});

describe('bulk tiers on orders', () => {
  it('applies only the store that owns the tiers, and never the public API', async () => {
    const db = seed();
    const one = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 1,
      idempotencyKey: 'owner-1',
    });
    expect(one.quotedRetailPriceMinor).toBe(BASE);
    const three = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 3,
      idempotencyKey: 'owner-3',
    });
    expect(three.quotedRetailPriceMinor).toBe(TIER_3 * 3n);
    expect(three.quotedWholesalePriceMinor).toBe(WHOLESALE * 3n);
    const ten = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 10,
      idempotencyKey: 'owner-10',
    });
    expect(ten.quotedRetailPriceMinor).toBe(TIER_10 * 10n);

    const reseller = await createOrder(db, {
      channel: 'reseller_bot',
      tenantId: TENANT_ID,
      botId: BOT_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 3,
      idempotencyKey: 'reseller-3',
    });
    expect(reseller.quotedRetailPriceMinor).toBe(9_000_000n * 3n);
    expect(reseller.quotedWholesalePriceMinor).toBe(WHOLESALE * 3n);

    const api = await createOrder(db, {
      channel: 'api',
      tenantId: TENANT_ID,
      botId: 'owner',
      productId: PRODUCT_ID,
      quantity: 3,
      idempotencyKey: 'api-3',
    });
    expect(api.quotedRetailPriceMinor).toBe(12_000_000n * 3n);
  });

  it('reprices an unpaid order and leaves a verified order alone', async () => {
    const db = seed();
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 1,
      idempotencyKey: 'reprice',
    });
    const updated = await updateOrderQuantity(db, order.id, 10);
    expect(updated.quotedRetailPriceMinor).toBe(TIER_10 * 10n);
    expect(updated.paymentStatus).toBe('awaiting');
    const row = db.tables.orders?.find((item) => item.id === order.id);
    if (row) {
      row.payment_status = 'verified';
    }
    await expect(updateOrderQuantity(db, order.id, 3)).rejects.toMatchObject({ code: 'ORDER_NOT_PAYABLE' });
    expect(db.tables.orders?.find((item) => item.id === order.id)?.quoted_retail_price).toBe((TIER_10 * 10n).toString());
  });

  it('debits the customer wallet for the quoted total', async () => {
    const db = seed();
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 3,
      idempotencyKey: 'wallet-3',
    });
    const paid = await payOrderFromCustomerWallet(db, order.id, CUSTOMER_ID);
    expect(paid.amount).toBe(order.quotedRetailPriceMinor);
    expect(paid.amount).toBe(TIER_3 * 3n);
    expect(paid.newBalance).toBe(100_000_000n - order.quotedRetailPriceMinor);
  });
});
