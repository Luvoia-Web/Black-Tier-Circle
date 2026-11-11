/**
 * @file tests/unit/payments.test.ts
 *
 * Unit tests for Binance Pay / BEP20 verification, decimal conversion, and money helpers.
 *
 * @module Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/fulfillment', () => ({
  processQueuedOrder: vi.fn().mockResolvedValue({
    success: true,
    method: 'file',
    fulfillmentAttemptId: '00000000-0000-4000-8000-000000000501',
  }),
}));

import type { VerifyUsdtTransferResult } from '@/integrations/bsc/verify';
import { invalidateCache } from '@/lib/cache';
import { PaymentError } from '@/lib/errors';
import { amountSufficient, amountsMatch, minorToUsdtApiString } from '@/lib/money';
import {
  bscValueToMinorUnits,
  buyerCheckoutMethods,
  buyerTrc20Visible,
  getPaymentModeLabel,
  isPaymentLive,
  paymentSandboxEnabled,
} from '@/lib/payment-config';
import { checkoutButtons } from '@/modules/catalog/shop-screen';
import { createOrder } from '@/modules/orders';
import { confirmDemoOrderPayment, verifyBep20Claim, verifyBinancePayClaim } from '@/modules/payments';
import { claimWalletTopup, openWalletTopup } from '@/modules/topups';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const TENANT_ID = '00000000-0000-4000-8000-000000000010';
const WALLET_ID = '00000000-0000-4000-8000-000000000020';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000101';
const BOT_ID = '00000000-0000-4000-8000-000000000201';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000301';

const VALID_TX =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
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
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENT_SANDBOX', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

describe('BEP20 order claims are closed', () => {
  it('does not verify a hash or mark the order paid', async () => {
    const { db, order } = await ownerOrder('bep-closed');
    let called = false;
    const result = await verifyBep20Claim(db, { orderId: order.id, txHash: VALID_TX }, async () => {
      called = true;
      return verifiedTransfer(order.quotedRetailPriceMinor);
    });
    expect(called).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.rejectReason).toBe('ORDER_CLAIM_CLOSED');
    expect(db.tables.orders?.[0]?.payment_status).toBe('awaiting');
    expect(db.tables.chain_payments ?? []).toHaveLength(0);
    expect(db.tables.payment_claims ?? []).toHaveLength(0);
  });
});

const STORE_ADDRESS = '0x1111111111111111111111111111111111111111';

function withStoreAddress(db: ReturnType<typeof seedDb>): void {
  db.tables.platform_settings = [
    {
      id: '00000000-0000-4000-8000-000000000099',
      platform_name: 'Black Tier Circle',
      platform_usdt_wallet_bep20: STORE_ADDRESS,
      bep20_enabled: true,
      binance_pay_enabled: false,
    },
  ];
}

function verifiedTransfer(amountMinor: bigint): VerifyUsdtTransferResult {
  return {
    status: 'verified',
    amountMinor,
    confirmations: 20,
    blockNumber: 100n,
    blockTimestamp: new Date('2026-11-11T00:00:00.000Z'),
    fromAddress: '0x2222222222222222222222222222222222222222',
  };
}

describe('crypto payments fail closed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    invalidateCache('platform_settings');
  });

  it('does not let a credited top-up hash pay an order by direct claim', async () => {
    const db = seedDb();
    withStoreAddress(db);
    const opened = await openWalletTopup(db, {
      customerId: CUSTOMER_ID,
      botId: 'owner',
      tenantId: null,
      amountMinor: 1_000_000n,
      payToAddress: STORE_ADDRESS,
    });
    const credited = await claimWalletTopup(db, { customerId: CUSTOMER_ID, txHash: VALID_TX }, async () =>
      verifiedTransfer(opened.topup.amountExpectedMinor),
    );
    expect(credited.status).toBe('credited');
    const order = await createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      idempotencyKey: 'hash-used-by-topup',
    });
    let called = false;
    const result = await verifyBep20Claim(db, { orderId: order.id, txHash: VALID_TX }, async () => {
      called = true;
      return verifiedTransfer(order.quotedRetailPriceMinor);
    });
    expect(called).toBe(false);
    expect(result).toMatchObject({ verified: false, rejectReason: 'ORDER_CLAIM_CLOSED' });
    const paid = db.tables.orders?.find((row) => String(row.id) === order.id);
    expect(paid?.payment_status).not.toBe('verified');
  });

  it('does not let the demo pay path mark an order paid in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PAYMENT_SANDBOX', 'true');
    const { db, order } = await ownerOrder('demo-blocked');
    await expect(confirmDemoOrderPayment(db, order.id)).rejects.toBeInstanceOf(PaymentError);
    expect(db.tables.orders?.[0]?.payment_status).not.toBe('verified');
    expect(paymentSandboxEnabled()).toBe(false);
  });

  it('does not treat a PAY_ reference as paid when the sandbox flag is off', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PAYMENT_SANDBOX', 'true');
    const { db, order } = await ownerOrder('binance-no-sandbox');
    const result = await verifyBinancePayClaim(db, { orderId: order.id, binanceOrderId: 'PAY_12345' });
    expect(result.verified).toBe(false);
    expect(result.rejectReason).toBe('BINANCE_UNAVAILABLE');
    expect(db.tables.orders?.[0]?.payment_status).toBe('awaiting');
  });

  it('hides TRC20 from buyers by default', () => {
    expect(buyerTrc20Visible()).toBe(false);
    expect(
      buyerCheckoutMethods({
        binancePayEnabled: false,
        bep20Enabled: true,
        trc20Enabled: true,
        demoEnabled: true,
      }).trc20,
    ).toBe(false);
    const buttons = checkoutButtons({
      orderId: '00000000-0000-4000-8000-000000000701',
      productId: PRODUCT_ID,
      totalMinor: 1_000_000n,
      balanceMinor: 0n,
      minimumDepositMinor: 1_000_000n,
      binance: false,
      bep20: true,
      trc20: false,
      demo: false,
    });
    expect(buttons.some((button) => button.data.startsWith('pay_trc20:'))).toBe(false);
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
  it('isPaymentLive is true only when Binance Pay is enabled and configured', () => {
    expect(isPaymentLive({ binancePayEnabled: false, binancePayConfigured: true })).toBe(false);
    expect(isPaymentLive({ binancePayEnabled: true, binancePayConfigured: false })).toBe(false);
    expect(isPaymentLive({ binancePayEnabled: true, binancePayConfigured: true })).toBe(true);
  });

  it("getPaymentModeLabel(false) returns a string containing 'Demo'", () => {
    expect(getPaymentModeLabel(false)).toContain('Demo');
  });
});
