/**
 * @file tests/unit/phase-j.test.ts
 *
 * Phase J test suite covering:
 * 1. Discount code redemption ONLY via `redeem_discount_code` RPC (no direct table writes)
 * 2. Discount code CRUD, validation, reseller policy lock, and audit_log writes
 * 3. Broadcast audience filtering, template rendering, rate-limited batching, scheduling,
 *    processing due jobs, cancellation, reseller policy enforcement, and audit_log writes
 * 4. Marketing Walkthrough #20 buyer @username picker source guard (no raw Customer id input)
 *
 * @module Tests
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encrypt } from '@/lib/encryption';
import { resetRateLimitStore } from '@/lib/rate-limiter';
import { redeemOpenCheckout } from '@/modules/pricing/discount';
import {
  broadcastBuyers,
  cancelScheduledBroadcast,
  createDiscountCode,
  deleteDiscountCode,
  listBroadcastJobs,
  processDueBroadcasts,
  readAudienceCounts,
  scheduleBroadcast,
  setDiscountActive,
  updateDiscountCode,
} from '@/modules/platform/growth';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const mockSendHtml = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockSendPhoto = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/integrations/telegram/api', () => ({
  telegramSendHtml: mockSendHtml,
  telegramSendPhoto: mockSendPhoto,
}));

const ACTOR_OWNER = '00000000-0000-4000-8000-000000000001';
const ACTOR_RESELLER = '00000000-0000-4000-8000-000000000002';
const TENANT_A = '00000000-0000-4000-8000-000000000010';
const BOT_A = '00000000-0000-4000-8000-000000000201';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000101';
const CUSTOMER_1 = '00000000-0000-4000-8000-000000000301';
const CUSTOMER_2 = '00000000-0000-4000-8000-000000000302';
const CUSTOMER_BLOCKED = '00000000-0000-4000-8000-000000000303';
const ORDER_1 = '00000000-0000-4000-8000-000000000501';
const ORDER_2 = '00000000-0000-4000-8000-000000000502';
const ORDER_3 = '00000000-0000-4000-8000-000000000503';
const CUSTOMER_3 = '00000000-0000-4000-8000-000000000304';
const CODE_ID = '00000000-0000-4000-8000-000000000701';

afterEach(() => {
  resetRateLimitStore();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mockSendHtml.mockClear();
  mockSendPhoto.mockClear();
});

describe('Phase J — RPC-only discount redemption', () => {
  it('redeems strictly through redeem_discount_code RPC and enforces limits', async () => {
    const db = createMemoryDb({
      platform_settings: [{ id: 'ps-1', fraud_discount_redemptions_per_customer: 5 }],
      products: [
        {
          id: PRODUCT_ID,
          sku: 'SKU-1',
          title: 'Gemini 18M',
          description: 'Plan',
          category: 'ai',
          delivery_type: 'manual',
          status: 'published',
          wholesale_price: '2000000',
          retail_price: '6000000',
          stock_unlimited: true,
          stock_count: null,
          reseller_eligible: true,
          max_purchase_qty: 5,
          estimated_delivery_minutes: null,
          version: 1,
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
        },
      ],
      discount_codes: [
        {
          id: CODE_ID,
          tenant_id: null,
          code: 'SAVE25',
          kind: 'percent',
          value: '25',
          min_order_minor: '4000000',
          max_uses: 2,
          used_count: 0,
          per_customer_limit: 1,
          starts_at: null,
          expires_at: null,
          active: true,
        },
      ],
      orders: [
        {
          id: ORDER_1,
          tenant_id: null,
          channel: 'owner_store',
          customer_id: CUSTOMER_1,
          product_id: PRODUCT_ID,
          quantity: 1,
          quoted_retail_price: '6000000',
          payment_status: 'awaiting',
          created_at: '2026-11-10T00:00:00.000Z',
        },
      ],
    });

    const rpcSpy = vi.spyOn(db, 'rpc');
    const first = await redeemOpenCheckout(db, {
      customerId: CUSTOMER_1,
      tenantId: null,
      code: 'save25',
    });
    expect(rpcSpy).toHaveBeenCalledWith('redeem_discount_code', {
      p_code_id: CODE_ID,
      p_customer_id: CUSTOMER_1,
      p_order_id: ORDER_1,
      p_order_minor: '6000000',
    });
    expect(first).toEqual({ applied: true, ok: true, total: '4.50 USDT' });
    expect(db.tables.discount_codes?.[0]?.used_count).toBe(1);
    expect(db.tables.discount_redemptions).toHaveLength(1);
    expect(db.tables.orders?.[0]?.quoted_retail_price).toBe('4500000');

    // Second attempt by the same customer is refused by RPC per_customer_limit = 1.
    const repeatSameCustomer = await redeemOpenCheckout(db, {
      customerId: CUSTOMER_1,
      tenantId: null,
      code: 'SAVE25',
    });
    expect(repeatSameCustomer).toEqual({
      applied: true,
      ok: false,
      message: 'You have already used that code.',
    });
    expect(db.tables.discount_codes?.[0]?.used_count).toBe(1);

    // Second customer uses slot 2; third customer hits max_uses = 2 enforced by RPC.
    db.tables.orders?.push(
      {
        id: ORDER_2,
        tenant_id: null,
        channel: 'owner_store',
        customer_id: CUSTOMER_2,
        product_id: PRODUCT_ID,
        quantity: 1,
        quoted_retail_price: '6000000',
        payment_status: 'awaiting',
        created_at: '2026-11-10T01:00:00.000Z',
      },
      {
        id: ORDER_3,
        tenant_id: null,
        channel: 'owner_store',
        customer_id: CUSTOMER_3,
        product_id: PRODUCT_ID,
        quantity: 1,
        quoted_retail_price: '6000000',
        payment_status: 'awaiting',
        created_at: '2026-11-10T02:00:00.000Z',
      },
    );
    const secondOk = await redeemOpenCheckout(db, {
      customerId: CUSTOMER_2,
      tenantId: null,
      code: 'SAVE25',
    });
    expect(secondOk).toEqual({ applied: true, ok: true, total: '4.50 USDT' });
    const maxedOut = await redeemOpenCheckout(db, {
      customerId: CUSTOMER_3,
      tenantId: null,
      code: 'SAVE25',
    });
    expect(maxedOut).toEqual({ applied: true, ok: false, message: 'That code has been used up.' });

    // Source guard: no direct discount_redemptions inserts or discount_codes updates remain.
    const discountSource = fs.readFileSync(path.resolve(process.cwd(), 'modules/pricing/discount.ts'), 'utf8');
    expect(discountSource).toContain("rpc('redeem_discount_code'");
    expect(discountSource).not.toContain("from('discount_redemptions').insert");
    expect(discountSource).not.toContain("from('discount_codes').update");
  });
});

describe('Phase J — Discount CRUD and Reseller Policy', () => {
  it('supports create/update/toggle/delete with audit logs and honors reseller discount lock', async () => {
    const db = createMemoryDb({
      platform_settings: [{ id: 'ps-1', reseller_policy: { discounts: true } }],
      tenants: [
        { id: TENANT_A, owner_user_id: ACTOR_RESELLER, status: 'active', reseller_policy_override: {} },
      ],
      discount_codes: [],
    });

    const created = await createDiscountCode(
      db,
      null,
      {
        code: 'FLASH2',
        kind: 'fixed',
        value: '2000000',
        minOrderMinor: '5000000',
        maxUses: 100,
        perCustomerLimit: 1,
        expiresAt: '',
      },
      ACTOR_OWNER,
    );
    expect(created.id).toBeTruthy();
    expect(db.tables.discount_codes?.[0]?.code).toBe('FLASH2');

    await updateDiscountCode(
      db,
      null,
      created.id,
      {
        code: 'FLASH3',
        kind: 'fixed',
        value: '3000000',
        minOrderMinor: '5000000',
        maxUses: 50,
        perCustomerLimit: 1,
        expiresAt: '',
      },
      ACTOR_OWNER,
    );
    expect(db.tables.discount_codes?.[0]?.code).toBe('FLASH3');

    await setDiscountActive(db, null, created.id, false, ACTOR_OWNER);
    expect(db.tables.discount_codes?.[0]?.active).toBe(false);

    await deleteDiscountCode(db, null, created.id, ACTOR_OWNER);
    expect(db.tables.discount_codes).toHaveLength(0);

    const actions = (db.tables.audit_log ?? []).map((row) => row.action);
    expect(actions).toEqual(['discount.create', 'discount.update', 'discount.disable', 'discount.delete']);

    // Reseller override locks discounts.
    db.tables.tenants![0]!.reseller_policy_override = { discounts: false };
    await expect(
      createDiscountCode(
        db,
        TENANT_A,
        {
          code: 'RESELL10',
          kind: 'percent',
          value: '10',
          minOrderMinor: '0',
          maxUses: null,
          perCustomerLimit: 1,
          expiresAt: '',
        },
        ACTOR_RESELLER,
      ),
    ).rejects.toMatchObject({ code: 'RESELLER_POLICY_BLOCKED' });
  });
});

describe('Phase J — Broadcasts, scheduling, audience, and UI guards', () => {
  it('filters audiences, sends templated messages, schedules/cancels/processes due jobs, and avoids Customer id label', async () => {
    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    const oldDate = '2026-09-01T00:00:00.000Z';
    const freshDate = new Date().toISOString();

    const db = createMemoryDb({
      platform_settings: [{ id: 'ps-1', reseller_policy: { broadcasts: true } }],
      tenants: [
        { id: TENANT_A, owner_user_id: ACTOR_RESELLER, status: 'active', reseller_policy_override: {} },
      ],
      bot_connections: [
        { id: BOT_A, tenant_id: TENANT_A, username: 'alpha_bot', encrypted_token: encrypt('123456:ABCDEF'), status: 'connected' },
      ],
      store_config: [
        {
          id: 'sc-a',
          tenant_id: TENANT_A,
          version: 1,
          config: {
            links: {
              channel: { label: 'Channel', url: 'https://t.me/alpha' },
              group: { label: 'Group', url: '' },
              website: { label: 'Website', url: '' },
            },
          },
        },
      ],
      customers: [
        { id: CUSTOMER_1, bot_id: BOT_A, telegram_chat_id: '10001', first_name: 'Asha', username: 'asha', credit_balance: '5000000', is_blocked: false, updated_at: freshDate },
        { id: CUSTOMER_2, bot_id: BOT_A, telegram_chat_id: '10002', first_name: 'Nora', username: 'nora', credit_balance: '0', is_blocked: false, updated_at: oldDate },
        { id: CUSTOMER_BLOCKED, bot_id: BOT_A, telegram_chat_id: '10003', first_name: 'Blocked', username: 'blk', credit_balance: '0', is_blocked: true, updated_at: freshDate },
      ],
      orders: [
        { id: ORDER_1, tenant_id: TENANT_A, customer_id: CUSTOMER_1, payment_status: 'verified' },
      ],
      broadcasts: [],
    });

    const counts = await readAudienceCounts(db, 'reseller', TENANT_A, BOT_A);
    expect(counts).toEqual({ all: 2, buyers: 1, inactive: 1, skippedBlocked: 1 });

    const sent = await broadcastBuyers(db, {
      role: 'reseller',
      tenantId: TENANT_A,
      botId: BOT_A,
      body: 'Hi {name}! Balance: {balance}\n{channel}\n{group}',
      audience: 'buyers',
      confirm: true,
      actorId: ACTOR_RESELLER,
      batchPauseMs: 0,
    });
    expect(sent).toEqual({ confirm: false, audience: 'buyers', recipients: 1, sent: 1, failed: 0, skippedBlocked: 1 });
    expect(mockSendHtml).toHaveBeenCalledTimes(1);
    expect(mockSendHtml.mock.calls[0]?.[1]).toBe('10001');
    expect(mockSendHtml.mock.calls[0]?.[2]).toContain('Hi Asha! Balance: 5.00 USDT');
    expect(mockSendHtml.mock.calls[0]?.[2]).toContain('https://t.me/alpha');

    // Rate limit refuses immediate second broadcast.
    await expect(
      broadcastBuyers(db, {
        role: 'reseller',
        tenantId: TENANT_A,
        botId: BOT_A,
        body: 'Second',
        audience: 'all',
        confirm: true,
        actorId: ACTOR_RESELLER,
        batchPauseMs: 0,
      }),
    ).rejects.toMatchObject({ code: 'BROADCAST_LIMIT' });

    const futureIso = new Date(Date.now() + 10 * 60_000).toISOString();
    const scheduled = await scheduleBroadcast(db, {
      role: 'reseller',
      tenantId: TENANT_A,
      botId: BOT_A,
      actorId: ACTOR_RESELLER,
      body: 'Photo promo for {name}',
      imageUrl: 'https://cdn.example.test/promo.png',
      audience: 'inactive',
      scheduledFor: futureIso,
    });
    expect(scheduled.recipients).toBe(1);

    const listed = await listBroadcastJobs(db, TENANT_A);
    expect(listed.jobs.some((job) => job.id === scheduled.id && job.status === 'scheduled')).toBe(true);

    // Process due scheduled job at future timestamp.
    const processed = await processDueBroadcasts(db, new Date(Date.now() + 20 * 60_000), 0);
    expect(processed.processed).toBe(1);
    expect(mockSendPhoto).toHaveBeenCalledTimes(1);
    expect(mockSendPhoto.mock.calls[0]?.[1]).toBe('10002');
    expect(mockSendPhoto.mock.calls[0]?.[3]).toContain('Photo promo for Nora');

    // Cancel another scheduled job.
    const toCancel = await scheduleBroadcast(db, {
      role: 'reseller',
      tenantId: TENANT_A,
      botId: BOT_A,
      actorId: ACTOR_RESELLER,
      body: 'Cancel me',
      audience: 'all',
      scheduledFor: futureIso,
    });
    await cancelScheduledBroadcast(db, TENANT_A, toCancel.id, ACTOR_RESELLER);
    expect(db.tables.broadcasts?.find((row) => row.id === toCancel.id)?.status).toBe('canceled');

    // Marketing username picker source guard.
    const growthPanel = fs.readFileSync(path.resolve(process.cwd(), 'components/growth/growth-panel.tsx'), 'utf8');
    expect(growthPanel).toContain('/api/platform/people?type=buyer');
    expect(growthPanel).not.toMatch(/Customer id/i);
  });
});
