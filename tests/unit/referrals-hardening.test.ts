import { describe, expect, it } from 'vitest';
import { DEFAULT_STORE_CONFIG } from '@/modules/store-config/defaults';
import { saveStoreConfig } from '@/modules/store-config';
import { adjustCustomerPoints } from '@/modules/referrals/admin';
import { claimFreebie } from '@/modules/referrals/freebies';
import { friendJoinedText, freebieListText, referralHomeText } from '@/modules/referrals/screens';
import { qualifyPendingReferrals, redeemPoints } from '@/modules/referrals/store';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const ACTOR = '00000000-0000-4000-8000-000000000002';
const REFERRER = '00000000-0000-4000-8000-0000000000a1';
const BUYER = '00000000-0000-4000-8000-0000000000a2';
const OTHER = '00000000-0000-4000-8000-000000000099';

function store(rows: Parameters<typeof createMemoryDb>[0]) {
  return createMemoryDb(rows);
}

describe('referral hardening', () => {
  it('grants one reward when five sweeps run together and ignores a wallet with no product order', async () => {
    const db = store({
      customers: [
        { id: REFERRER, bot_id: null, first_name: 'Ann', credit_balance: '0', telegram_chat_id: '1' },
        { id: BUYER, bot_id: null, first_name: 'Bo', credit_balance: '5000000', telegram_chat_id: '2' },
      ],
      referrals: [
        {
          id: '00000000-0000-4000-8000-0000000000b1',
          tenant_id: null,
          referrer_customer_id: REFERRER,
          referred_customer_id: BUYER,
          status: 'pending',
          referrer_notified_at: null,
          joined_notified_at: null,
        },
      ],
      orders: [
        {
          id: '00000000-0000-4000-8000-0000000000e1',
          customer_id: BUYER,
          product_id: '00000000-0000-4000-8000-0000000000f1',
          payment_status: 'verified',
          quoted_retail_price: '1000000',
        },
      ],
      ledger_transactions: [
        { id: 'topup', entry_type: 'top_up_credit', amount: '5000000', reference_type: 'topup_token' },
      ],
    });
    await saveStoreConfig(
      db,
      null,
      { ...DEFAULT_STORE_CONFIG, referrals: { ...DEFAULT_STORE_CONFIG.referrals, enabled: true } },
      ACTOR,
      0,
    );
    await Promise.all(
      [1, 2, 3, 4, 5].map(() => qualifyPendingReferrals(db, new Date('2026-11-10T12:00:00.000Z'))),
    );
    expect((db.tables.points_ledger ?? []).filter((row) => row.reason === 'referral_reward')).toHaveLength(1);
  });

  it('leaves a referral pending when the buyer only topped up and when the daily cap is full', async () => {
    const qualified = Array.from({ length: 20 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000001${index.toString(16).padStart(2, '0')}`,
      tenant_id: null,
      referrer_customer_id: REFERRER,
      referred_customer_id: `00000000-0000-4000-8000-0000000002${index.toString(16).padStart(2, '0')}`,
      status: 'qualified',
      qualified_at: '2026-11-10T01:00:00.000Z',
      referrer_notified_at: '2026-11-10T01:00:00.000Z',
      joined_notified_at: '2026-11-10T01:00:00.000Z',
    }));
    const db = store({
      customers: [
        { id: REFERRER, bot_id: null, first_name: 'Ann', credit_balance: '0' },
        { id: BUYER, bot_id: null, first_name: 'Bo', credit_balance: '9000000' },
      ],
      referrals: [
        ...qualified,
        {
          id: '00000000-0000-4000-8000-0000000000b2',
          tenant_id: null,
          referrer_customer_id: REFERRER,
          referred_customer_id: BUYER,
          status: 'pending',
          referrer_notified_at: null,
          joined_notified_at: null,
        },
      ],
      orders: [
        {
          id: '00000000-0000-4000-8000-0000000000e2',
          customer_id: BUYER,
          product_id: '00000000-0000-4000-8000-0000000000f1',
          payment_status: 'verified',
          quoted_retail_price: '1000000',
        },
      ],
    });
    await saveStoreConfig(
      db,
      null,
      { ...DEFAULT_STORE_CONFIG, referrals: { ...DEFAULT_STORE_CONFIG.referrals, enabled: true, dailyRewardCap: 20 } },
      ACTOR,
      0,
    );
    const result = await qualifyPendingReferrals(db, new Date('2026-11-10T12:00:00.000Z'));
    expect(result.capped).toBe(1);
    expect(result.granted).toBe(0);
    const pending = (db.tables.referrals ?? []).find((row) => row.id === '00000000-0000-4000-8000-0000000000b2');
    expect(pending?.status).toBe('pending');
    expect((db.tables.points_ledger ?? []).filter((row) => row.reason === 'referral_reward')).toHaveLength(0);
  });

  it('credits one redeem when two requests race and never takes the wallet negative', async () => {
    const db = store({
      customers: [{ id: REFERRER, bot_id: null, credit_balance: '0' }],
      points_ledger: [
        { id: 'seed', customer_id: REFERRER, tenant_id: null, delta: 5, reason: 'referral_reward', reference: 'seed' },
      ],
    });
    const [first, second] = await Promise.all([
      redeemPoints(db, {
        customerId: REFERRER,
        points: 5,
        valuePerPointMinor: 200_000n,
        requestId: `${REFERRER}:44`,
        minPoints: 5,
      }),
      redeemPoints(db, {
        customerId: REFERRER,
        points: 5,
        valuePerPointMinor: 200_000n,
        requestId: `${REFERRER}:44`,
        minPoints: 5,
      }),
    ]);
    expect(first.newBalanceMinor).toBe(1_000_000n);
    expect(second.newBalanceMinor).toBe(1_000_000n);
    expect((db.tables.points_ledger ?? []).filter((row) => row.reason === 'redeem_to_wallet')).toHaveLength(1);
    const short = await redeemPoints(db, {
      customerId: REFERRER,
      points: 1,
      valuePerPointMinor: 200_000n,
      requestId: `${REFERRER}:45`,
      minPoints: 5,
    });
    expect(short.success).toBe(false);
    expect(short.errorCode).toBe('BELOW_MINIMUM');
    expect(db.tables.customers?.[0]?.credit_balance).toBe('1000000');
  });

  it('unlocks a freebie at the required count and claims it once', async () => {
    const db = store({
      customers: [{ id: REFERRER, bot_id: null, first_name: 'Ann' }],
      referrals: [
        {
          id: '00000000-0000-4000-8000-0000000000b3',
          tenant_id: null,
          referrer_customer_id: REFERRER,
          referred_customer_id: BUYER,
          status: 'qualified',
        },
      ],
      freebies: [
        {
          id: '00000000-0000-4000-8000-0000000000f9',
          tenant_id: null,
          title: 'Guide',
          description: '',
          kind: 'text',
          content: 'Hello there',
          required_referrals: 2,
          active: true,
          sort_order: 0,
        },
      ],
    });
    const locked = await claimFreebie(db, {
      tenantId: null,
      customerId: REFERRER,
      freebieId: '00000000-0000-4000-8000-0000000000f9',
    });
    expect(locked.status).toBe('locked');
    db.tables.referrals?.push({
      id: '00000000-0000-4000-8000-0000000000b4',
      tenant_id: null,
      referrer_customer_id: REFERRER,
      referred_customer_id: '00000000-0000-4000-8000-0000000000a3',
      status: 'qualified',
    });
    const first = await claimFreebie(db, {
      tenantId: null,
      customerId: REFERRER,
      freebieId: '00000000-0000-4000-8000-0000000000f9',
    });
    const second = await claimFreebie(db, {
      tenantId: null,
      customerId: REFERRER,
      freebieId: '00000000-0000-4000-8000-0000000000f9',
    });
    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    expect(second.freebie?.content).toBe('Hello there');
    expect(db.tables.freebie_claims ?? []).toHaveLength(1);
  });

  it('stops a reseller from adjusting another store and keeps buyer text clean', async () => {
    const db = store({
      customers: [{ id: REFERRER, bot_id: null, first_name: 'Ann', credit_balance: '0' }],
      bot_connections: [{ id: '00000000-0000-4000-8000-0000000000b8', tenant_id: OTHER }],
    });
    await expect(
      adjustCustomerPoints(db, OTHER, ACTOR, {
        customerId: REFERRER,
        delta: 1,
        reason: 'Wrong store',
        requestId: 'adjust-other-store',
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    const home = referralHomeText({
      template: DEFAULT_STORE_CONFIG.referrals.templates.home,
      link: 'https://t.me/store_bot?start=ref_abcdefghjkmn',
      invited: 0,
      pending: 0,
      qualified: 0,
      points: 0,
      walletMinor: 0n,
      nextLine: null,
    });
    const list = freebieListText(DEFAULT_STORE_CONFIG.referrals.templates.freebies, []);
    const joined = friendJoinedText(DEFAULT_STORE_CONFIG.referrals.templates.friendJoined, '<Ann>');
    for (const text of [home, list, joined]) {
      expect(text).not.toMatch(/undefined|null/);
      expect(text.split('\n').every((line) => line.trim().length > 0)).toBe(true);
    }
    expect(joined).toBe('A friend joined. Ann');
  });
});
