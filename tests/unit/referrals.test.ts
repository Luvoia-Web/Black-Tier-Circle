import { describe, expect, it } from 'vitest';
import { DEFAULT_STORE_CONFIG } from '@/modules/store-config/defaults';
import { saveStoreConfig } from '@/modules/store-config';
import { friendJoinedText, referralHomeText, referralLink } from '@/modules/referrals/screens';
import { appendPoints, qualifyPendingReferrals, redeemPoints } from '@/modules/referrals/store';
import { REFERRAL_ALPHABET, REFERRAL_CODE_LENGTH, generateReferralCode, nextReferralCode } from '@/modules/referrals/codes';
import { attachDecision } from '@/modules/referrals/rules';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const CUSTOMER = '00000000-0000-4000-8000-0000000000c1';

describe('referral codes', () => {
  it('uses 12 readable characters and skips a taken code', () => {
    const code = generateReferralCode();
    expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
    expect([...code].every((character) => REFERRAL_ALPHABET.includes(character))).toBe(true);
    expect(code).not.toMatch(/[01ilo]/);
    const values = ['taken', 'fresh'];
    expect(nextReferralCode(new Set(['taken']), () => values.shift() ?? 'fresh')).toBe('fresh');
  });
});

describe('referral attach rules', () => {
  it('accepts a new buyer once and blocks self, old buyers, and other stores', () => {
    const base = {
      referrerId: 'a',
      referredId: 'b',
      referredIsNew: true,
      alreadyReferred: false,
      hasVerifiedOrder: false,
      sameStore: true,
    };
    expect(attachDecision(base)).toBe('ok');
    expect(attachDecision({ ...base, referredId: 'a' })).toBe('self');
    expect(attachDecision({ ...base, referredIsNew: false })).toBe('not_new');
    expect(attachDecision({ ...base, alreadyReferred: true })).toBe('already');
    expect(attachDecision({ ...base, hasVerifiedOrder: true })).toBe('existing_order');
    expect(attachDecision({ ...base, sameStore: false })).toBe('other_store');
  });
});

describe('points ledger', () => {
  it('writes one row for a repeated reason and reference', async () => {
    const db = createMemoryDb({
      customers: [{ id: CUSTOMER, bot_id: null, credit_balance: '0' }],
    });
    const first = await appendPoints(db, {
      customerId: CUSTOMER,
      tenantId: null,
      delta: 1,
      reason: 'referral_reward',
      reference: 'ref-1',
    });
    const second = await appendPoints(db, {
      customerId: CUSTOMER,
      tenantId: null,
      delta: 1,
      reason: 'referral_reward',
      reference: 'ref-1',
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(db.tables.points_ledger ?? []).toHaveLength(1);
  });

  it('credits the wallet once when the same redeem request repeats', async () => {
    const db = createMemoryDb({
      customers: [{ id: CUSTOMER, bot_id: null, credit_balance: '0' }],
      points_ledger: [
        { id: 'p1', customer_id: CUSTOMER, tenant_id: null, delta: 5, reason: 'referral_reward', reference: 'seed' },
      ],
    });
    const first = await redeemPoints(db, {
      customerId: CUSTOMER,
      points: 5,
      valuePerPointMinor: 200_000n,
      requestId: `${CUSTOMER}:9`,
      minPoints: 5,
    });
    const second = await redeemPoints(db, {
      customerId: CUSTOMER,
      points: 5,
      valuePerPointMinor: 200_000n,
      requestId: `${CUSTOMER}:9`,
      minPoints: 5,
    });
    expect(first.success).toBe(true);
    expect(first.newBalanceMinor).toBe(1_000_000n);
    expect(first.newPoints).toBe(0);
    expect(second.success).toBe(true);
    expect(second.newBalanceMinor).toBe(1_000_000n);
    expect((db.tables.points_ledger ?? []).filter((row) => row.reason === 'redeem_to_wallet')).toHaveLength(1);
  });
});

describe('referral screens', () => {
  it('builds a link and a home screen without empty or undefined lines', () => {
    const link = referralLink('store_bot', 'abcdefghjkmn');
    expect(link).toBe('https://t.me/store_bot?start=ref_abcdefghjkmn');
    expect(referralLink('bad bot', 'abcdefghjkmn')).toBeNull();
    const text = referralHomeText({
      template: DEFAULT_STORE_CONFIG.referrals.templates.home,
      link,
      invited: 1,
      pending: 1,
      qualified: 0,
      points: 0,
      walletMinor: 0n,
      nextLine: null,
    });
    expect(text).toContain(link);
    expect(text).not.toMatch(/undefined|null/);
    expect(text.split('\n').every((line) => line.trim().length > 0)).toBe(true);
    expect(friendJoinedText(DEFAULT_STORE_CONFIG.referrals.templates.friendJoined, 'Alex')).toBe('A friend joined. Alex');
    expect(friendJoinedText(DEFAULT_STORE_CONFIG.referrals.templates.friendJoined, null)).toBe('A friend joined.');
  });
});

describe('referral sweep', () => {
  it('grants points once when the same pending referral is swept five times', async () => {
    const db = createMemoryDb({
      customers: [
        { id: 'referrer', bot_id: null, first_name: 'Ann', credit_balance: '0', telegram_chat_id: '1' },
        { id: 'buyer', bot_id: null, first_name: 'Bo', credit_balance: '0', telegram_chat_id: '2' },
      ],
      referrals: [
        {
          id: 'ref-1',
          tenant_id: null,
          referrer_customer_id: 'referrer',
          referred_customer_id: 'buyer',
          status: 'pending',
          referrer_notified_at: null,
          joined_notified_at: null,
        },
      ],
      orders: [
        {
          id: 'order-1',
          customer_id: 'buyer',
          product_id: 'product-1',
          payment_status: 'verified',
          quoted_retail_price: '1000000',
        },
      ],
    });
    await saveStoreConfig(db, null, { ...DEFAULT_STORE_CONFIG, referrals: { ...DEFAULT_STORE_CONFIG.referrals, enabled: true } }, '00000000-0000-4000-8000-000000000002', 0);
    const notices: string[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await qualifyPendingReferrals(db, new Date('2026-11-10T12:00:00.000Z'), {
        qualified: async () => {
          notices.push('qualified');
        },
      });
    }
    expect(notices).toEqual(['qualified']);
    expect((db.tables.points_ledger ?? []).filter((row) => row.reason === 'referral_reward')).toHaveLength(1);
    expect(db.tables.referrals?.[0]?.status).toBe('qualified');
  });
});
