import { describe, expect, it } from 'vitest';
import { adjustCustomerPoints, rejectReferral } from '@/modules/referrals/admin';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const ACTOR = '00000000-0000-4000-8000-000000000002';
const REFERRAL = '00000000-0000-4000-8000-0000000000d1';
const CUSTOMER = '00000000-0000-4000-8000-0000000000c1';
const OTHER = '00000000-0000-4000-8000-000000000099';

describe('growth admin', () => {
  it('rejects only this store pending referral and refuses a negative point balance', async () => {
    const db = createMemoryDb({
      customers: [{ id: CUSTOMER, bot_id: null, first_name: 'Ann', credit_balance: '0' }],
      referrals: [
        {
          id: REFERRAL,
          tenant_id: null,
          referrer_customer_id: CUSTOMER,
          referred_customer_id: '00000000-0000-4000-8000-0000000000c2',
          status: 'pending',
          reject_reason: null,
          created_at: '2026-11-10T00:00:00.000Z',
        },
      ],
      points_ledger: [
        { id: 'p1', customer_id: CUSTOMER, tenant_id: null, delta: 1, reason: 'referral_reward', reference: 'seed' },
      ],
    });
    await expect(
      rejectReferral(db, OTHER, ACTOR, { referralId: REFERRAL, reason: 'Not this store' }),
    ).rejects.toMatchObject({ code: 'REFERRAL_NOT_FOUND' });
    await rejectReferral(db, null, ACTOR, { referralId: REFERRAL, reason: 'Duplicate' });
    expect(db.tables.referrals?.[0]?.status).toBe('rejected');
    expect(db.tables.audit_log).toHaveLength(1);
    await expect(
      adjustCustomerPoints(db, null, ACTOR, {
        customerId: CUSTOMER,
        delta: -5,
        reason: 'Too much',
        requestId: 'adjust-request-1',
      }),
    ).rejects.toMatchObject({ code: 'POINTS_BELOW_ZERO' });
    const once = await adjustCustomerPoints(db, null, ACTOR, {
      customerId: CUSTOMER,
      delta: 2,
      reason: 'Goodwill',
      requestId: 'adjust-request-2',
    });
    const twice = await adjustCustomerPoints(db, null, ACTOR, {
      customerId: CUSTOMER,
      delta: 2,
      reason: 'Goodwill',
      requestId: 'adjust-request-2',
    });
    expect(once).toEqual({ balance: 3, created: true });
    expect(twice.created).toBe(false);
    expect(twice.balance).toBe(3);
  });
});
