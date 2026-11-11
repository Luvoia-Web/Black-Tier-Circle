import { describe, expect, it } from 'vitest';
import type { VerifyUsdtTransferResult } from '@/integrations/bsc/verify';
import { reviewWalletTopup } from '@/modules/topups/admin';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const CUSTOMER = '00000000-0000-4000-8000-000000000301';
const TOPUP = '00000000-0000-4000-8000-000000000801';
const ACTOR = '00000000-0000-4000-8000-000000000901';
const HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDRESS = '0x1111111111111111111111111111111111111111';

function db() {
  return createMemoryDb({
    customers: [{ id: CUSTOMER, credit_balance: '0', first_name: 'Ada' }],
    platform_settings: [
      {
        id: '00000000-0000-4000-8000-000000000099',
        platform_usdt_wallet_bep20: ADDRESS,
        bep20_enabled: true,
        binance_pay_enabled: false,
      },
    ],
    wallet_topups: [
      {
        id: TOPUP,
        customer_id: CUSTOMER,
        tenant_id: null,
        pay_to_address: ADDRESS,
        amount_expected_minor: '1000000',
        status: 'pending',
        tx_hash: null,
        network: 'bep20',
        created_at: '2026-11-11T00:00:00.000Z',
        expires_at: '2099-01-01T00:00:00.000Z',
      },
    ],
  });
}

function verified(amountMinor: bigint): VerifyUsdtTransferResult {
  return {
    status: 'verified',
    amountMinor,
    confirmations: 20,
    blockNumber: 10n,
    blockTimestamp: new Date('2026-11-11T00:10:00.000Z'),
    fromAddress: '0x2222222222222222222222222222222222222222',
  };
}

describe('top-up review', () => {
  it('credits a checked hash once and ignores the same approval again', async () => {
    const memory = db();
    const first = await reviewWalletTopup(
      memory,
      { actorId: ACTOR, tenantId: null, topupId: TOPUP, decision: 'approve', reason: 'Matched the transfer', txHash: HASH },
      async () => verified(1_000_000n),
    );
    const second = await reviewWalletTopup(
      memory,
      { actorId: ACTOR, tenantId: null, topupId: TOPUP, decision: 'approve', reason: 'Matched the transfer', txHash: HASH },
      async () => verified(1_000_000n),
    );
    expect(first.success).toBe(true);
    expect(first.repeated).toBe(false);
    expect(second.repeated).toBe(true);
    expect(memory.tables.customers?.[0]?.credit_balance).toBe('1000000');
    expect(memory.tables.audit_log).toHaveLength(1);
  });

  it('credits the stored amount when no hash is pasted', async () => {
    const memory = db();
    const result = await reviewWalletTopup(memory, {
      actorId: ACTOR,
      tenantId: null,
      topupId: TOPUP,
      decision: 'approve',
      reason: 'Buyer paid outside the chat',
    });
    expect(result.success).toBe(true);
    expect(memory.tables.customers?.[0]?.credit_balance).toBe('1000000');
    expect(String(memory.tables.chain_payments?.[0]?.tx_hash ?? '')).toMatch(/^manual:/);
  });

  it('credits a typed amount that differs from the expected tag, once', async () => {
    const memory = db();
    const first = await reviewWalletTopup(
      memory,
      {
        actorId: ACTOR,
        tenantId: null,
        topupId: TOPUP,
        decision: 'approve',
        reason: 'Buyer sent 2.50 instead of the tagged amount',
        txHash: HASH,
        verifiedAmount: '2.50',
      },
      async () => verified(2_500_000n),
    );
    const second = await reviewWalletTopup(
      memory,
      {
        actorId: ACTOR,
        tenantId: null,
        topupId: TOPUP,
        decision: 'approve',
        reason: 'Buyer sent 2.50 instead of the tagged amount',
        txHash: HASH,
        verifiedAmount: '2.50',
      },
      async () => verified(2_500_000n),
    );
    expect(first.success).toBe(true);
    expect(second.repeated).toBe(true);
    expect(memory.tables.customers?.[0]?.credit_balance).toBe('2500000');
    expect(memory.tables.audit_log?.[0]?.reason).toBe('Buyer sent 2.50 instead of the tagged amount');
    expect(memory.tables.wallet_topups?.[0]?.credited_amount_minor).toBe('2500000');
  });

  it('does not credit an overpayment unless the owner types that amount', async () => {
    const memory = db();
    await expect(
      reviewWalletTopup(
        memory,
        { actorId: ACTOR, tenantId: null, topupId: TOPUP, decision: 'approve', reason: 'Chain amount was larger', txHash: HASH },
        async () => verified(2_500_000n),
      ),
    ).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' });
    expect(memory.tables.customers?.[0]?.credit_balance).toBe('0');
    expect(memory.tables.audit_log ?? []).toHaveLength(0);
  });

  it('rejects a pending top-up without crediting it', async () => {
    const memory = db();
    const result = await reviewWalletTopup(memory, {
      actorId: ACTOR,
      tenantId: null,
      topupId: TOPUP,
      decision: 'reject',
      reason: 'Buyer sent the wrong network',
    });
    expect(result.success).toBe(true);
    expect(memory.tables.wallet_topups?.[0]?.status).toBe('rejected');
    expect(memory.tables.customers?.[0]?.credit_balance).toBe('0');
    expect(memory.tables.audit_log?.[0]?.action).toBe('topup.reject');
  });

  it('does not credit when the chain check says the transfer is too early', async () => {
    const memory = db();
    await expect(
      reviewWalletTopup(
        memory,
        { actorId: ACTOR, tenantId: null, topupId: TOPUP, decision: 'approve', reason: 'Checking an old hash', txHash: HASH },
        async () => ({ status: 'rejected', reason: 'TOO_EARLY' }),
      ),
    ).rejects.toMatchObject({ code: 'TOO_EARLY' });
    expect(memory.tables.customers?.[0]?.credit_balance).toBe('0');
  });
});
