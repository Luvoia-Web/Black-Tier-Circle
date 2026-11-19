/**
 * @file tests/unit/phase-f.test.ts
 *
 * Phase F tests covering Customers directory (search, state filters, store scoping),
 * rich Buyer detail (wallet, top-ups, points, unified order status, support threads,
 * plain-English flags), Support inbox (thread list, close/reopen, tenant scoping),
 * and owner-only linked replacements (threadId linkage, audit log, reseller 403 block).
 *
 * @module Tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from '@/lib/rate-limiter';
import { readPeople, readPerson } from '@/modules/platform/people';
import { ownerReplace } from '@/modules/platform/replacements';
import {
  listSupportThreads,
  readSupportThread,
  setSupportThreadStatus,
} from '@/modules/platform/support';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const mockRequireUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireUser: mockRequireUser,
  };
});

import { POST as replacePost } from '@/app/api/platform/replacements/route';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const RESELLER_USER_ID = '00000000-0000-4000-8000-000000000002';
const TENANT_A = '00000000-0000-4000-8000-000000000010';
const TENANT_B = '00000000-0000-4000-8000-000000000011';
const BOT_A = '00000000-0000-4000-8000-000000000201';
const BUYER_OWNER = '00000000-0000-4000-8000-000000000301';
const BUYER_RESELLER = '00000000-0000-4000-8000-000000000302';
const BUYER_BLOCKED = '00000000-0000-4000-8000-000000000303';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000401';
const ORDER_DELIVERED = '00000000-0000-4000-8000-000000000501';
const THREAD_OWNER = '00000000-0000-4000-8000-000000000601';
const THREAD_RESELLER = '00000000-0000-4000-8000-000000000602';
const THREAD_OTHER_BUYER = '00000000-0000-4000-8000-000000000603';

afterEach(() => {
  resetRateLimitStore();
  vi.restoreAllMocks();
  mockRequireUser.mockReset();
});

function seedPhaseFDb() {
  return createMemoryDb({
    tenants: [
      { id: TENANT_A, owner_user_id: RESELLER_USER_ID, display_name: 'Alpha Keys', business_name: 'Alpha Keys', status: 'active' },
      { id: TENANT_B, owner_user_id: '00000000-0000-4000-8000-000000000009', display_name: 'Beta Store', business_name: 'Beta Store', status: 'active' },
    ],
    bot_connections: [{ id: BOT_A, tenant_id: TENANT_A, username: 'alpha_keys_bot', status: 'connected' }],
    products: [
      {
        id: PRODUCT_ID,
        sku: 'PASS-PRO-1M',
        title: 'Pro Pass 1M',
        delivery_type: 'manual',
        status: 'published',
        wholesale_price: '1000000',
        retail_price: '2000000',
        supplier_id: null,
        supplier_sku: null,
      },
    ],
    customers: [
      {
        id: BUYER_OWNER,
        bot_id: null,
        telegram_user_id: '10001',
        username: 'anyaa28',
        first_name: 'Anya',
        credit_balance: '3500000',
        is_blocked: false,
        created_at: '2026-10-01T10:00:00.000Z',
        updated_at: '2026-10-12T10:00:00.000Z',
      },
      {
        id: BUYER_RESELLER,
        bot_id: BOT_A,
        telegram_user_id: '10002',
        username: 'dev_rk',
        first_name: 'Dev',
        credit_balance: '1000000',
        is_blocked: false,
        created_at: '2026-10-02T10:00:00.000Z',
        updated_at: '2026-10-11T10:00:00.000Z',
      },
      {
        id: BUYER_BLOCKED,
        bot_id: null,
        telegram_user_id: '10003',
        username: 'spammer99',
        first_name: 'Spam',
        credit_balance: '0',
        is_blocked: true,
        blocked_at: '2026-10-10T08:00:00.000Z',
        blocked_reason: 'Repeated unpaid flood since 2026-10-10',
        created_at: '2026-10-03T10:00:00.000Z',
        updated_at: '2026-10-10T08:00:00.000Z',
      },
    ],
    orders: [
      {
        id: ORDER_DELIVERED,
        tenant_id: null,
        channel: 'owner_store',
        bot_id: null,
        customer_id: BUYER_OWNER,
        product_id: PRODUCT_ID,
        quantity: 1,
        quoted_retail_price: '2000000',
        payment_status: 'verified',
        delivery_status: 'sent',
        fulfillment_status: 'failed',
        created_at: '2026-10-11T12:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000502',
        tenant_id: TENANT_A,
        channel: 'reseller_bot',
        bot_id: BOT_A,
        customer_id: BUYER_RESELLER,
        product_id: PRODUCT_ID,
        quantity: 2,
        quoted_retail_price: '4000000',
        payment_status: 'verified',
        delivery_status: 'sent',
        fulfillment_status: 'ready',
        created_at: '2026-10-11T14:00:00.000Z',
      },
    ],
    wallet_topups: [
      {
        id: '00000000-0000-4000-8000-000000000701',
        customer_id: BUYER_OWNER,
        amount_expected_minor: '5000000',
        credited_amount_minor: '5000000',
        status: 'credited',
        created_at: '2026-10-10T09:00:00.000Z',
      },
    ],
    points_ledger: [
      { id: 'pt-1', customer_id: BUYER_OWNER, delta: 4, reason: 'referral_reward', reference: 'ref-1' },
      { id: 'pt-2', customer_id: BUYER_OWNER, delta: -1, reason: 'redeem_to_wallet', reference: 'red-1' },
    ],
    support_threads: [
      {
        id: THREAD_OWNER,
        tenant_id: null,
        customer_id: BUYER_OWNER,
        bot_id: null,
        status: 'open',
        unread_for_owner: true,
        last_message_at: '2026-10-12T09:00:00.000Z',
      },
      {
        id: THREAD_RESELLER,
        tenant_id: TENANT_A,
        customer_id: BUYER_RESELLER,
        bot_id: BOT_A,
        status: 'open',
        unread_for_owner: true,
        last_message_at: '2026-10-12T08:00:00.000Z',
      },
      {
        id: THREAD_OTHER_BUYER,
        tenant_id: null,
        customer_id: BUYER_BLOCKED,
        bot_id: null,
        status: 'closed',
        unread_for_owner: false,
        last_message_at: '2026-10-10T07:00:00.000Z',
      },
    ],
    support_messages: [
      {
        id: '00000000-0000-4000-8000-000000000801',
        thread_id: THREAD_OWNER,
        sender: 'customer',
        body: 'My pass activation code is already redeemed.',
        created_at: '2026-10-12T09:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000802',
        thread_id: THREAD_RESELLER,
        sender: 'customer',
        body: 'Need invoice for Alpha Keys order.',
        created_at: '2026-10-12T08:00:00.000Z',
      },
    ],
    audit_log: [
      {
        id: 'aud-flag-1',
        actor_id: null,
        action: 'fraud.freebie_refused',
        target_type: 'customer',
        target_id: BUYER_OWNER,
        reason: 'Freebie limit on 2026-10-11 exceeded',
        created_at: '2026-10-11T15:00:00.000Z',
      },
    ],
  });
}

describe('Phase F customers list and rich buyer detail', () => {
  it('filters buyers by state/search, isolates resellers, and builds plain-English buyer detail', async () => {
    const db = seedPhaseFDb();

    const ownerAll = await readPeople(db, {
      role: 'owner',
      tenantId: null,
      botId: null,
      kind: 'buyer',
      q: '',
      state: 'all',
      page: 1,
      pageSize: 24,
    });
    expect(ownerAll.summary).toEqual({
      totalBuyers: 3,
      activeBuyers: 2,
      blockedBuyers: 1,
      unreadSupport: 2,
      flaggedBuyers: 2,
      totalBalance: '4.50 USDT',
    });

    const flagged = await readPeople(db, {
      role: 'owner',
      tenantId: null,
      botId: null,
      kind: 'buyer',
      q: '',
      state: 'flagged',
      page: 1,
      pageSize: 24,
    });
    expect(flagged.rows.map((r) => r.id).sort()).toEqual([BUYER_OWNER, BUYER_BLOCKED].sort());

    const resellerOnly = await readPeople(db, {
      role: 'reseller',
      tenantId: TENANT_A,
      botId: BOT_A,
      kind: 'buyer',
      q: '',
      state: 'all',
      page: 1,
      pageSize: 24,
    });
    expect(resellerOnly.rows).toHaveLength(1);
    expect(resellerOnly.rows[0]?.name).toBe('@dev_rk');
    expect(resellerOnly.rows[0]?.storeName).toBe('Alpha Keys');

    const buyerDetail = await readPerson(db, {
      id: BUYER_OWNER,
      kind: 'buyer',
      role: 'owner',
      botId: null,
    });
    expect(buyerDetail).not.toBeNull();
    expect(buyerDetail?.wallet.balance).toBe('3.50 USDT');
    expect(buyerDetail?.wallet.points).toBe(3);
    expect(buyerDetail?.wallet.topups[0]?.status).toBe('Credited');
    expect(buyerDetail?.orders[0]?.status).toBe('Delivered');
    expect(buyerDetail?.orders[0]?.delivered).toBe(true);
    expect(buyerDetail?.supportThreads).toHaveLength(1);
    expect(buyerDetail?.flags[0]?.label).toBe('Freebie daily limit hit');
    expect(buyerDetail?.flags[0]?.reason).toBe('Freebie limit on Oct 11, 2026 exceeded');

    const crossTenantDetail = await readPerson(db, {
      id: BUYER_OWNER,
      kind: 'buyer',
      role: 'reseller',
      botId: BOT_A,
    });
    expect(crossTenantDetail).toBeNull();
  });
});

describe('Phase F support inbox and thread lifecycle', () => {
  it('scopes support inbox threads, filters by status/search, and audits close/reopen', async () => {
    const db = seedPhaseFDb();

    const ownerInbox = await listSupportThreads(db, null, true, { status: 'unread', q: 'anyaa' });
    expect(ownerInbox.counts).toEqual({ all: 3, unread: 2, open: 2, closed: 1 });
    expect(ownerInbox.threads).toHaveLength(1);
    expect(ownerInbox.threads[0]?.id).toBe(THREAD_OWNER);

    const resellerInbox = await listSupportThreads(db, TENANT_A, false);
    expect(resellerInbox.threads).toHaveLength(1);
    expect(resellerInbox.threads[0]?.storeName).toBe('Alpha Keys');

    const ownerDetail = await readSupportThread(db, THREAD_OWNER, { owner: true, tenantId: null });
    expect(ownerDetail.deliveredOrders).toHaveLength(1);
    expect(ownerDetail.customer?.name).toBe('@anyaa28');

    const crossRead = await readSupportThread(db, THREAD_OWNER, { owner: false, tenantId: TENANT_A });
    expect(crossRead.thread).toBeNull();

    await expect(
      setSupportThreadStatus(db, {
        threadId: THREAD_OWNER,
        status: 'closed',
        scope: { owner: false, tenantId: TENANT_A },
        actorId: RESELLER_USER_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    const closed = await setSupportThreadStatus(db, {
      threadId: THREAD_OWNER,
      status: 'closed',
      scope: { owner: true, tenantId: null },
      actorId: OWNER_ID,
    });
    expect(closed.statusLabel).toBe('Closed');
    expect(db.tables.audit_log?.some((row) => row.action === 'support.close' && row.target_id === THREAD_OWNER)).toBe(true);
  });
});

describe('Phase F linked warranty replacements and owner-only enforcement', () => {
  it('links ownerReplace to the provided support thread and writes threadId into audit_log', async () => {
    const db = seedPhaseFDb();
    const deliveries: string[] = [];

    await expect(
      ownerReplace(db, {
        orderId: ORDER_DELIVERED,
        actorId: OWNER_ID,
        mode: 'manual',
        content: 'NEW-KEY-XYZ',
        reason: 'Broken original key',
        threadId: THREAD_OTHER_BUYER,
      }),
    ).rejects.toMatchObject({ code: 'THREAD_MISMATCH' });

    const result = await ownerReplace(
      db,
      {
        orderId: ORDER_DELIVERED,
        actorId: OWNER_ID,
        mode: 'manual',
        content: 'NEW-KEY-XYZ',
        reason: 'Verified broken pass in support',
        threadId: THREAD_OWNER,
      },
      {
        deliver: async (_database, item) => {
          deliveries.push(item.content);
        },
      },
    );

    expect(deliveries).toEqual(['NEW-KEY-XYZ']);
    expect(result).toEqual({ support: 'posted', threadId: THREAD_OWNER });

    const audit = db.tables.audit_log?.find((row) => row.action === 'order_replaced');
    expect(audit).toBeDefined();
    expect((audit?.after_val as Record<string, unknown>)?.threadId).toBe(THREAD_OWNER);

    const linkedMessages = (db.tables.support_messages ?? []).filter(
      (msg) => msg.thread_id === THREAD_OWNER && msg.sender === 'owner',
    );
    expect(linkedMessages).toHaveLength(1);
    expect(String(linkedMessages[0]?.body)).toContain('replacement item');
  });

  it('blocks resellers with 403 when calling POST /api/platform/replacements with decision=replace', async () => {
    const db = seedPhaseFDb();
    mockRequireUser.mockResolvedValue({
      user: { id: RESELLER_USER_ID },
      profile: { role: 'reseller' },
      admin: db,
    });

    const response = await replacePost(
      new Request('http://localhost/api/platform/replacements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision: 'replace',
          orderId: ORDER_DELIVERED,
          mode: 'manual',
          content: 'SHOULD-BLOCK',
        }),
      }),
    );

    expect(response.status).toBe(403);
  });
});
