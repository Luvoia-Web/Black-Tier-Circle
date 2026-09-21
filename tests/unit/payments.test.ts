/**
 * @file tests/unit/payments.test.ts
 *
 * Unit tests for Binance Pay / BEP20 verification, decimal conversion, and money helpers.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { amountSufficient, amountsMatch, minorToUsdtApiString } from '@/lib/money';
import { bscValueToMinorUnits, getPaymentModeLabel, PAYMENT_CONFIG } from '@/lib/payment-config';
import { createOrder } from '@/modules/orders';
import { verifyBep20Claim, verifyBinancePayClaim } from '@/modules/payments';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const TENANT_ID = '00000000-0000-4000-8000-000000000010';
const WALLET_ID = '00000000-0000-4000-8000-000000000020';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000101';
const BOT_ID = '00000000-0000-4000-8000-000000000201';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000301';

const VALID_TX =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const VALID_TX_TWO =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const FAIL_TX = '0xFAIL';

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

async function ownerOrder(key: string) {
  const db = seedDb();
  const order = await createOrder(db, {
    channel: 'owner_store',
    botId: 'owner',
    customerId: CUSTOMER_ID,
    productId: PRODUCT_ID,
    idempotencyKey: key,
  });
  return { db, order };
}

describe('BINANCE PAY (sandbox)', () => {
  it('verifyBinancePayClaim with PAY_ prefix order ID → verified=true', async () => {
    const { db, order } = await ownerOrder('pay-success');
    const result = await verifyBinancePayClaim(db, { orderId: order.id, binanceOrderId: 'PAY_12345' });
    expect(result.verified).toBe(true);
    const latest = db.tables.orders?.[0];
    expect(latest?.payment_status).toBe('verified');
    expect(latest?.fulfillment_status).toBe('queued');
  });

  it('verifyBinancePayClaim with FAIL_ prefix order ID → verified=false', async () => {
    const { db, order } = await ownerOrder('pay-fail');
    const result = await verifyBinancePayClaim(db, { orderId: order.id, binanceOrderId: 'FAIL_12345' });
    expect(result.verified).toBe(false);
    expect(db.tables.orders?.[0]?.payment_status).toBe('failed');
  });

  it('verifyBinancePayClaim on already-verified order → idempotent, returns true', async () => {
    const { db, order } = await ownerOrder('pay-idempotent');
    await verifyBinancePayClaim(db, { orderId: order.id, binanceOrderId: 'PAY_AAA' });
    const second = await verifyBinancePayClaim(db, { orderId: order.id, binanceOrderId: 'PAY_BBB' });
    expect(second.verified).toBe(true);
  });

  it('verifyBinancePayClaim with mismatched amount → verified=false', async () => {
    const db = seedDb();
    const order = await createOrder(db, {
      channel: 'reseller_bot',
      tenantId: TENANT_ID,
      botId: BOT_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      idempotencyKey: 'pay-mismatch',
    });
    const result = await verifyBinancePayClaim(db, { orderId: order.id, binanceOrderId: 'PAY_MISMATCH' });
    expect(result.verified).toBe(false);
    expect(result.rejectReason).toBe('AMOUNT_MISMATCH');
    expect(db.tables.orders?.[0]?.payment_status).toBe('failed');
    expect(db.tables.orders?.[0]?.funding_status).toBe('released');
  });
});

describe('BEP20 (sandbox)', () => {
  it('verifyBep20Claim with valid 0x hash → verified=true', async () => {
    const { db, order } = await ownerOrder('bep-success');
    const result = await verifyBep20Claim(db, { orderId: order.id, txHash: VALID_TX });
    expect(result.verified).toBe(true);
    expect(db.tables.orders?.[0]?.payment_status).toBe('verified');
  });

  it('verifyBep20Claim with 0xFAIL hash → verified=false', async () => {
    const { db, order } = await ownerOrder('bep-fail');
    const result = await verifyBep20Claim(db, { orderId: order.id, txHash: FAIL_TX });
    expect(result.verified).toBe(false);
  });

  it('verifyBep20Claim with invalid format → throws ValidationError', async () => {
    const { db, order } = await ownerOrder('bep-invalid');
    await expect(verifyBep20Claim(db, { orderId: order.id, txHash: 'not-a-hash' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('verifyBep20Claim same hash twice → second call verified=false (replay prevention)', async () => {
    const db = seedDb();
    const first = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      idempotencyKey: 'bep-replay-1',
    });
    const second = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      idempotencyKey: 'bep-replay-2',
    });
    const firstResult = await verifyBep20Claim(db, { orderId: first.id, txHash: VALID_TX_TWO });
    expect(firstResult.verified).toBe(true);
    const replay = await verifyBep20Claim(db, { orderId: second.id, txHash: VALID_TX_TWO });
    expect(replay.verified).toBe(false);
    expect(replay.rejectReason).toBe('TX_REPLAY');
  });
});

describe('DECIMAL CONVERSION', () => {
  it('bscValueToMinorUnits("10000000000000000000") → 10_000_000n (10 USDT)', () => {
    expect(bscValueToMinorUnits('10000000000000000000')).toBe(10_000_000n);
  });

  it('bscValueToMinorUnits("1000000000000000000") → 1_000_000n (1 USDT)', () => {
    expect(bscValueToMinorUnits('1000000000000000000')).toBe(1_000_000n);
  });

  it('bscValueToMinorUnits("500000000000000000") → 500_000n (0.5 USDT)', () => {
    expect(bscValueToMinorUnits('500000000000000000')).toBe(500_000n);
  });
});

describe('MONEY HELPERS', () => {
  it('amountsMatch(10_000_000n, 10_000_000n) → true', () => {
    expect(amountsMatch(10_000_000n, 10_000_000n)).toBe(true);
  });

  it('amountsMatch(10_000_000n, 10_000_001n) → false', () => {
    expect(amountsMatch(10_000_000n, 10_000_001n)).toBe(false);
  });

  it('amountSufficient(10_000_000n, 10_000_001n) → true', () => {
    expect(amountSufficient(10_000_000n, 10_000_001n)).toBe(true);
  });

  it('minorToUsdtApiString(10_500_000n) → "10.50"', () => {
    expect(minorToUsdtApiString(10_500_000n)).toBe('10.50');
  });

  it('minorToUsdtApiString(1_000_000n) → "1.00"', () => {
    expect(minorToUsdtApiString(1_000_000n)).toBe('1.00');
  });
});

describe('PAYMENT CONFIG', () => {
  it("PAYMENT_CONFIG.mode returns 'demo' when PLACEHOLDER_ vars set", () => {
    expect(PAYMENT_CONFIG.mode).toBe('demo');
  });

  it("getPaymentModeLabel() returns string containing 'Demo' in demo mode", () => {
    expect(getPaymentModeLabel()).toContain('Demo');
  });
});
