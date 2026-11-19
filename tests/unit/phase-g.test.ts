/**
 * @file tests/unit/phase-g.test.ts
 *
 * Phase G tests covering Resellers network KPIs & range filtering,
 * wholesale debt aggregation, donut share & sparklines, rich store detail,
 * status transitions with audit reasons, and owner-only API guards.
 *
 * @module Tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '@/lib/errors';
import { resetRateLimitStore } from '@/lib/rate-limiter';
import { readResellerDetail, readResellersNetwork } from '@/modules/platform/resellers';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const mockRequireOwner = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireOwner: mockRequireOwner,
  };
});

import { GET as resellersGet } from '@/app/api/platform/resellers/route';
import { PATCH as statusPatch } from '@/app/api/resellers/[tenantId]/status/route';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const USER_A = '00000000-0000-4000-8000-000000000002';
const USER_B = '00000000-0000-4000-8000-000000000003';
const USER_C = '00000000-0000-4000-8000-000000000004';
const TENANT_A = '00000000-0000-4000-8000-000000000010';
const TENANT_B = '00000000-0000-4000-8000-000000000011';
const TENANT_PENDING = '00000000-0000-4000-8000-000000000012';
const BOT_A = '00000000-0000-4000-8000-000000000201';
const BOT_B = '00000000-0000-4000-8000-000000000202';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000401';

afterEach(() => {
  resetRateLimitStore();
  vi.restoreAllMocks();
  mockRequireOwner.mockReset();
});

function seedPhaseGDb() {
  return createMemoryDb({
    platform_settings: [
      {
        id: 'ps-1',
        reseller_policy: { botCopy: true, markupPercent: true, apiKeys: false },
      },
    ],
    profiles: [
      { id: USER_A, role: 'reseller', display_name: 'Prince Tiwari' },
      { id: USER_B, role: 'reseller', display_name: 'Maya Rao' },
      { id: USER_C, role: 'reseller', display_name: 'Pending Partner' },
    ],
    tenants: [
      {
        id: TENANT_A,
        owner_user_id: USER_A,
        display_name: 'Prince',
        business_name: 'Prince Store',
        support_contact: '@prince_help',
        status: 'active',
        reseller_policy_override: { apiKeys: true },
        created_at: '2026-10-05T10:00:00.000Z',
        updated_at: '2026-10-12T10:00:00.000Z',
      },
      {
        id: TENANT_B,
        owner_user_id: USER_B,
        display_name: 'Nova',
        business_name: 'NovaKeys',
        support_contact: '@novakeys',
        status: 'suspended',
        reseller_policy_override: null,
        created_at: '2026-08-01T10:00:00.000Z',
        updated_at: '2026-10-10T10:00:00.000Z',
      },
      {
        id: TENANT_PENDING,
        owner_user_id: USER_C,
        display_name: 'Gayathri Digital',
        business_name: null,
        support_contact: '@gd_support',
        status: 'pending',
        reseller_policy_override: null,
        created_at: '2026-10-11T12:00:00.000Z',
        updated_at: '2026-10-11T12:00:00.000Z',
      },
    ],
    tenant_settings: [
      {
        tenant_id: TENANT_A,
        store_status: 'open',
        support_contact: '@prince_help',
        markup_percent: 20,
      },
    ],
    wallets: [
      { id: 'wal-a', tenant_id: TENANT_A, balance_total: '45000000', balance_reserved: '5000000' },
      { id: 'wal-b', tenant_id: TENANT_B, balance_total: '10000000', balance_reserved: '0' },
    ],
    bot_connections: [
      {
        id: BOT_A,
        tenant_id: TENANT_A,
        username: 'prince_store_bot',
        status: 'connected',
        last_health_at: '2026-10-12T09:00:00.000Z',
      },
      {
        id: BOT_B,
        tenant_id: TENANT_B,
        username: 'novakeys_bot',
        status: 'error',
        last_health_at: '2026-10-09T09:00:00.000Z',
      },
    ],
    products: [
      {
        id: PRODUCT_ID,
        title: 'HMA VPN 30D',
        wholesale_price: '2000000',
        retail_price: '3000000',
      },
    ],
    reseller_listings: [
      {
        id: 'list-a1',
        tenant_id: TENANT_A,
        product_id: PRODUCT_ID,
        retail_price: '3500000',
        is_visible: true,
      },
    ],
    customers: [
      {
        id: 'cust-a1',
        bot_id: BOT_A,
        username: 'anyaa28',
        first_name: 'Anya',
        credit_balance: '1000000',
        is_blocked: false,
        created_at: '2026-10-09T10:00:00.000Z',
        updated_at: '2026-10-12T10:00:00.000Z',
      },
      {
        id: 'cust-b1',
        bot_id: BOT_B,
        username: 'bob',
        first_name: 'Bob',
        credit_balance: '0',
        is_blocked: true,
        created_at: '2026-08-15T10:00:00.000Z',
        updated_at: '2026-09-01T10:00:00.000Z',
      },
    ],
    orders: [
      {
        id: 'ord-a-recent-1',
        tenant_id: TENANT_A,
        customer_id: 'cust-a1',
        product_id: PRODUCT_ID,
        quoted_retail_price: '5000000',
        quoted_wholesale_price: '2000000',
        payment_status: 'verified',
        funding_status: 'reserved',
        delivery_status: 'sent',
        fulfillment_status: 'ready',
        created_at: '2026-10-11T10:00:00.000Z',
      },
      {
        id: 'ord-a-recent-2',
        tenant_id: TENANT_A,
        customer_id: 'cust-a1',
        product_id: PRODUCT_ID,
        quoted_retail_price: '5000000',
        quoted_wholesale_price: '2000000',
        payment_status: 'verified',
        funding_status: 'debited',
        delivery_status: 'sent',
        fulfillment_status: 'ready',
        created_at: '2026-10-09T10:00:00.000Z',
      },
      {
        id: 'ord-b-month-old',
        tenant_id: TENANT_B,
        customer_id: 'cust-b1',
        product_id: PRODUCT_ID,
        quoted_retail_price: '4000000',
        quoted_wholesale_price: '2000000',
        payment_status: 'verified',
        funding_status: 'not_applicable',
        delivery_status: 'sent',
        fulfillment_status: 'ready',
        created_at: '2026-09-25T10:00:00.000Z',
      },
    ],
    audit_log: [
      {
        id: 'aud-1',
        tenant_id: TENANT_A,
        action: 'reseller.approve',
        reason: 'Verified store on 2026-10-05',
        created_at: '2026-10-05T11:00:00.000Z',
      },
    ],
  });
}

describe('Phase G resellers network and store detail', () => {
  it('computes range revenue, wholesale owed, pending queue, donut slices, and filters', async () => {
    const db = seedPhaseGDb();
    const fixedNow = new Date('2026-10-12T18:00:00.000Z');

    const net30 = await readResellersNetwork(db, { range: '30d', now: fixedNow });
    expect(net30.kpis.totalStores).toBe(3);
    expect(net30.kpis.activeStores).toBe(1);
    expect(net30.kpis.pendingStores).toBe(1);
    expect(net30.kpis.suspendedStores).toBe(1);
    expect(net30.kpis.networkRevenue).toBe('14.00 USDT');
    expect(net30.kpis.wholesaleOwed).toBe('4.00 USDT');
    expect(net30.kpis.owingStoresCount).toBe(2);
    expect(net30.kpis.totalBuyers).toBe(2);
    expect(net30.pending).toHaveLength(1);
    expect(net30.pending[0]?.name).toBe('Gayathri Digital');
    expect(net30.revenueShare.map((s) => s.name)).toEqual(['Prince Store', 'NovaKeys']);

    const prince30 = net30.stores.find((s) => s.id === TENANT_A);
    expect(prince30?.revenue).toBe('10.00 USDT');
    expect(prince30?.orders).toBe(2);
    expect(prince30?.wallet).toBe('40.00 USDT');
    expect(prince30?.owesYou).toBe('2.00 USDT');
    expect(prince30?.botStatus).toBe('Online');
    expect(prince30?.repeatBuyerPercent).toBe(100);
    expect(prince30?.sparkline).toHaveLength(7);

    const net7 = await readResellersNetwork(db, { range: '7d', q: 'nova', now: fixedNow });
    expect(net7.kpis.networkRevenue).toBe('10.00 USDT');
    expect(net7.stores).toHaveLength(1);
    expect(net7.stores[0]?.id).toBe(TENANT_B);
    expect(net7.stores[0]?.revenue).toBe('0.00 USDT');
  });

  it('builds full reseller detail with bots, products, orders, buyers, wallet, override, and plain audit trail', async () => {
    const db = seedPhaseGDb();
    const detail = await readResellerDetail(db, TENANT_A, 'prince@store.test');

    expect(detail).not.toBeNull();
    expect(detail?.name).toBe('Prince Store');
    expect(detail?.ownerEmail).toBe('prince@store.test');
    expect(detail?.wallet.available).toBe('40.00 USDT');
    expect(detail?.wallet.owesYou).toBe('2.00 USDT');
    expect(detail?.bots[0]?.username).toBe('@prince_store_bot');
    expect(detail?.products).toHaveLength(1);
    expect(detail?.orders).toHaveLength(2);
    expect(detail?.orders[0]?.status).toBe('Delivered');
    expect(detail?.customers[0]?.name).toBe('@anyaa28');
    expect(detail?.policy.override).toEqual({ apiKeys: true });
    expect(detail?.audit[0]?.action).toBe('Approved reseller');
    expect(detail?.audit[0]?.reason).toBe('Verified store on Oct 5, 2026');
  });
});

describe('Phase G status mutations and owner-only API guard', () => {
  it('writes reason to audit_log on suspend/reactivate and blocks resellers with 403', async () => {
    const db = seedPhaseGDb();

    mockRequireOwner.mockRejectedValueOnce(new AuthError('FORBIDDEN', 'Owner access required', 403));
    const forbiddenList = await resellersGet(new Request('http://localhost/api/platform/resellers'));
    expect(forbiddenList.status).toBe(403);

    mockRequireOwner.mockResolvedValue({
      user: { id: OWNER_ID },
      profile: { role: 'owner' },
      admin: db,
    });

    const suspended = await statusPatch(
      new Request(`http://localhost/api/resellers/${TENANT_A}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'suspended', reason: 'Unpaid wholesale balance' }),
      }),
      { params: { tenantId: TENANT_A } },
    );
    expect(suspended.status).toBe(200);
    expect(db.tables.tenants?.find((t) => t.id === TENANT_A)?.status).toBe('suspended');

    const audit = db.tables.audit_log?.find((row) => row.action === 'reseller.suspend' && row.target_id === TENANT_A);
    expect(audit?.reason).toBe('Unpaid wholesale balance');
  });
});
