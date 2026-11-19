/**
 * @file tests/unit/phase-h.test.ts
 *
 * Phase H tests covering separate Wallets & ledger vs Payments data:
 * safe usdtToMinor supplier conversion, ledger filters & CSV export,
 * reseller isolation, wholesale debts list, topupHealth expiry/confirmations,
 * owner-only token/payment API guards, and audit_log writes on mutations.
 *
 * @module Tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '@/lib/errors';
import { resetRateLimitStore } from '@/lib/rate-limiter';
import { moneyCsv, readMoney } from '@/modules/platform/money';
import { topupHealth } from '@/modules/topups/admin';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const mockRequireOwner = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireOwner: mockRequireOwner,
  };
});

import { GET as paymentsGet } from '@/app/api/admin/payments/route';
import { POST as overridePost } from '@/app/api/admin/payments/[orderId]/override/route';
import { GET as tokensGet, POST as tokensPost } from '@/app/api/admin/tokens/route';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const TENANT_A = '00000000-0000-4000-8000-000000000010';
const TENANT_B = '00000000-0000-4000-8000-000000000011';
const WALLET_A = '00000000-0000-4000-8000-000000000020';
const WALLET_B = '00000000-0000-4000-8000-000000000021';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000401';
const ORDER_PENDING_CLAIM = '00000000-0000-4000-8000-000000000501';
const PAY_TO = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

afterEach(() => {
  resetRateLimitStore();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mockRequireOwner.mockReset();
});

function seedPhaseHDb() {
  return createMemoryDb({
    platform_settings: [
      {
        id: 'ps-1',
        bep20_enabled: true,
        platform_usdt_wallet_bep20: PAY_TO,
        bep20_confirmations: 16,
        topup_expiry_minutes: 45,
      },
    ],
    suppliers: [
      {
        id: 'sup-1',
        name: 'ProdSeller',
        balance_usdt: '19.99',
        status: 'connected',
      },
    ],
    tenants: [
      { id: TENANT_A, display_name: 'Alpha', business_name: 'Alpha Store', status: 'active' },
      { id: TENANT_B, display_name: 'Beta', business_name: 'Beta Store', status: 'active' },
    ],
    wallets: [
      { id: WALLET_A, tenant_id: TENANT_A, balance_total: '50000000', balance_reserved: '10000000' },
      { id: WALLET_B, tenant_id: TENANT_B, balance_total: '20000000', balance_reserved: '0' },
    ],
    bot_connections: [{ id: 'bot-a', tenant_id: TENANT_A, username: 'alpha_bot', status: 'connected' }],
    customers: [
      { id: 'c1', bot_id: 'bot-a', credit_balance: '1500000' },
      { id: 'c2', bot_id: null, credit_balance: '2500000' },
    ],
    products: [{ id: PRODUCT_ID, title: 'ChatGPT Plus', wholesale_price: '2000000', retail_price: '3000000' }],
    orders: [
      {
        id: 'ord-debt-a',
        tenant_id: TENANT_A,
        product_id: PRODUCT_ID,
        quoted_retail_price: '3000000',
        quoted_wholesale_price: '2000000',
        payment_status: 'verified',
        funding_status: 'reserved',
        fulfillment_status: 'supplier_pending',
        created_at: '2026-10-12T10:00:00.000Z',
      },
      {
        id: 'ord-debt-b',
        tenant_id: TENANT_B,
        product_id: PRODUCT_ID,
        quoted_retail_price: '4000000',
        quoted_wholesale_price: '2500000',
        payment_status: 'verified',
        funding_status: 'not_applicable',
        fulfillment_status: 'ready',
        created_at: '2026-10-11T10:00:00.000Z',
      },
      {
        id: ORDER_PENDING_CLAIM,
        tenant_id: null,
        channel: 'owner_store',
        product_id: PRODUCT_ID,
        customer_id: 'c2',
        quantity: 1,
        quoted_retail_price: '3000000',
        quoted_wholesale_price: '2000000',
        payment_status: 'pending_verification',
        funding_status: 'not_applicable',
        fulfillment_status: 'queued',
        delivery_status: 'not_ready',
        payment_method: 'bep20',
        version: 1,
        created_at: '2026-10-12T08:00:00.000Z',
      },
    ],
    ledger_transactions: [
      {
        id: 'led-1',
        wallet_id: WALLET_A,
        entry_type: 'top_up_credit',
        amount: '50000000',
        note: 'Deposited on 2026-10-10',
        created_at: '2026-10-10T10:00:00.000Z',
      },
      {
        id: 'led-2',
        wallet_id: WALLET_B,
        entry_type: 'manual_credit',
        amount: '20000000',
        note: 'Goodwill bonus',
        created_at: '2026-10-12T09:00:00.000Z',
      },
    ],
  });
}

describe('Phase H readMoney, filters, CSV, debts, and topupHealth', () => {
  it('computes balances cleanly, filters ledger by kind/wallet/date/search, isolates resellers, and escapes CSV', async () => {
    const db = seedPhaseHDb();

    const ownerAll = await readMoney(db, { role: 'owner', tenantId: null });
    expect(ownerAll.suppliers[0]?.balance).toBe('19.99 USDT');
    expect(ownerAll.resellerDebt).toBe('4.50 USDT');
    expect(ownerAll.debts).toHaveLength(2);
    expect(ownerAll.ledger).toHaveLength(2);

    const filtered = await readMoney(
      db,
      { role: 'owner', tenantId: null },
      { kind: 'top_up_credit', walletId: WALLET_A, from: '2026-10-09', to: '2026-10-11', q: 'Oct 10' },
    );
    expect(filtered.ledger).toHaveLength(1);
    expect(filtered.ledger[0]?.id).toBe('led-1');
    expect(filtered.ledger[0]?.kindLabel).toBe('Top-up credit');
    expect(filtered.ledger[0]?.note).toBe('Deposited on Oct 10, 2026');

    const csv = moneyCsv(filtered);
    expect(csv.split('\n')[0]).toBe('id,account,type,amount,note,created_at');
    expect(csv).toContain('"Top-up credit"');
    expect(csv).toContain('"50.00 USDT"');

    const resellerScoped = await readMoney(
      db,
      { role: 'reseller', tenantId: TENANT_A },
      { walletId: WALLET_B },
    );
    expect(resellerScoped.wallets).toHaveLength(1);
    expect(resellerScoped.wallets[0]?.id).toBe(WALLET_A);
    expect(resellerScoped.ledger.every((row) => row.walletId === WALLET_A)).toBe(true);
    expect(resellerScoped.debts.every((d) => d.tenantId === TENANT_A)).toBe(true);
  });

  it('returns expiryMinutes and overrideActive on topupHealth and honors BEP20_MIN_CONFIRMATIONS', async () => {
    const db = seedPhaseHDb();
    const health = await topupHealth(db, null, async () => 'ok');
    expect(health.confirmations).toBe(16);
    expect(health.expiryMinutes).toBe(45);
    expect(health.overrideActive).toBe(false);

    vi.stubEnv('BEP20_MIN_CONFIRMATIONS', '22');
    const overridden = await topupHealth(db, null, async () => 'ok');
    expect(overridden.confirmations).toBe(22);
    expect(overridden.overrideActive).toBe(true);
  });
});

describe('Phase H owner-only guards and audit logging', () => {
  it('blocks resellers with 403 and writes audit_log when owner creates token or overrides payment', async () => {
    const db = seedPhaseHDb();

    mockRequireOwner.mockRejectedValue(new AuthError('FORBIDDEN', 'Owner access required', 403));
    expect((await tokensGet(new Request('http://localhost/api/admin/tokens'))).status).toBe(403);
    expect((await paymentsGet(new Request('http://localhost/api/admin/payments'))).status).toBe(403);

    mockRequireOwner.mockResolvedValue({
      user: { id: OWNER_ID },
      profile: { role: 'owner' },
      admin: db,
    });

    const created = await tokensPost(
      new Request('http://localhost/api/admin/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountUsdtStr: '25.00', tenantId: TENANT_A }),
      }),
    );
    expect(created.status).toBe(201);
    expect(db.tables.audit_log?.some((row) => row.action === 'token.create' && row.tenant_id === TENANT_A)).toBe(true);

    const overridden = await overridePost(
      new Request(`http://localhost/api/admin/payments/${ORDER_PENDING_CLAIM}/override`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'fail', reason: 'Transfer was underpaid by buyer' }),
      }),
      { params: { orderId: ORDER_PENDING_CLAIM } },
    );
    expect(overridden.status).toBe(200);
    expect(
      db.tables.audit_log?.some((row) => row.action === 'payment.override' && row.target_id === ORDER_PENDING_CLAIM),
    ).toBe(true);
  });
});
