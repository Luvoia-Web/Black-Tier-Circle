import { describe, expect, it } from 'vitest';
import { REFERRAL_ALPHABET, REFERRAL_CODE_LENGTH, generateReferralCode, nextReferralCode } from '@/modules/referrals/codes';
import { attachDecision } from '@/modules/referrals/rules';
import { appendPoints, redeemPoints } from '@/modules/referrals/store';
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
