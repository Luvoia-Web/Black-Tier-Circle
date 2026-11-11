/**
 * @file tests/unit/topups.test.ts
 *
 * Wallet top-up creation, one-time credit, and buyer copy.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import type { VerifyUsdtTransferResult } from '@/integrations/bsc/verify';
import { ValidationError } from '@/lib/errors';
import {
  claimWalletTopup,
  expirePendingTopups,
  loadTopupLimits,
  openWalletTopup,
  TOPUP_FLOOR_MINOR,
} from '@/modules/topups';
import { parseTopupAmount, topupClaimText, topupInstructions } from '@/modules/topups/screens';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const CUSTOMER = '00000000-0000-4000-8000-000000000301';
const BOT = '00000000-0000-4000-8000-000000000201';
const ADDRESS = '0x1111111111111111111111111111111111111111';
const HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function dbWithBalance(balance = '0') {
  return createMemoryDb({
    customers: [{ id: CUSTOMER, bot_id: BOT, credit_balance: balance, first_name: 'Bo' }],
  });
}

function verified(amountMinor: bigint): VerifyUsdtTransferResult {
  return {
    status: 'verified',
    amountMinor,
    confirmations: 15,
    blockNumber: 10n,
    blockTimestamp: new Date('2026-11-11T00:00:00.000Z'),
    fromAddress: '0x2222222222222222222222222222222222222222',
  };
}

describe('wallet top-ups', () => {
  it('keeps the minimum at 1.00 USDT and reads a higher store minimum', async () => {
    const db = createMemoryDb({
      tenant_settings: [{ tenant_id: 'tenant-1', usdt_minimum_bep20: '0.50', max_topup_minor: '5000000' }],
    });
    const low = await loadTopupLimits(db, 'tenant-1');
    expect(low.min).toBe(TOPUP_FLOOR_MINOR);
    expect(low.max).toBe(5_000_000n);
    const owner = await loadTopupLimits(createMemoryDb(), null);
    expect(owner.min).toBe(TOPUP_FLOOR_MINOR);
  });

  it('reuses one open top-up instead of creating another', async () => {
    const db = dbWithBalance();
    const first = await openWalletTopup(db, {
      customerId: CUSTOMER,
      botId: BOT,
      tenantId: null,
      amountMinor: 5_000_000n,
    });
    const second = await openWalletTopup(db, {
      customerId: CUSTOMER,
      botId: BOT,
      tenantId: null,
      amountMinor: 10_000_000n,
    });
    expect(second.reused).toBe(true);
    expect(second.topup.id).toBe(first.topup.id);
    expect(second.topup.amountExpectedMinor).toBe(5_000_000n);
    expect(db.tables.wallet_topups).toHaveLength(1);
  });

  it('rejects an amount below 1.00 USDT', async () => {
    const db = dbWithBalance();
    await expect(
      openWalletTopup(db, { customerId: CUSTOMER, botId: BOT, tenantId: null, amountMinor: 500_000n }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('credits the received amount once and refuses the same hash on another top-up', async () => {
    const db = dbWithBalance();
    const opened = await openWalletTopup(db, {
      customerId: CUSTOMER,
      botId: BOT,
      tenantId: null,
      amountMinor: 1_000_000n,
    });
    let lookups = 0;
    const verify = async (): Promise<VerifyUsdtTransferResult> => {
      lookups += 1;
      return verified(2_500_000n);
    };
    const first = await claimWalletTopup(
      db,
      { customerId: CUSTOMER, txHash: HASH, toAddress: ADDRESS },
      verify,
    );
    const second = await claimWalletTopup(
      db,
      { customerId: CUSTOMER, txHash: HASH, toAddress: ADDRESS },
      verify,
    );
    expect(first.status).toBe('credited');
    expect(second.status).toBe('credited');
    if (second.status === 'credited') {
      expect(second.repeated).toBe(true);
      expect(second.newBalance).toBe(2_500_000n);
    }
    expect(lookups).toBe(1);
    expect(db.tables.customers?.[0]?.credit_balance).toBe('2500000');
    expect(db.tables.chain_payments).toHaveLength(1);
    expect(opened.topup.amountExpectedMinor).toBe(1_000_000n);

    const again = await openWalletTopup(db, {
      customerId: CUSTOMER,
      botId: BOT,
      tenantId: null,
      amountMinor: 1_000_000n,
    });
    expect(again.reused).toBe(false);
    const replay = await claimWalletTopup(
      db,
      { customerId: CUSTOMER, txHash: HASH, toAddress: ADDRESS },
      async () => verified(1_000_000n),
    );
    expect(replay).toMatchObject({ status: 'rejected', reason: 'ALREADY_USED' });
    expect(db.tables.customers?.[0]?.credit_balance).toBe('2500000');
  });

  it('does not credit when the transfer is too early or the provider is down', async () => {
    const db = dbWithBalance();
    await openWalletTopup(db, { customerId: CUSTOMER, botId: BOT, tenantId: null, amountMinor: 1_000_000n });
    const early = await claimWalletTopup(
      db,
      { customerId: CUSTOMER, txHash: HASH, toAddress: ADDRESS },
      async () => ({ status: 'rejected', reason: 'TOO_EARLY' }),
    );
    expect(early).toMatchObject({ status: 'rejected', reason: 'TOO_EARLY' });
    const down = await claimWalletTopup(
      db,
      { customerId: CUSTOMER, txHash: HASH, toAddress: ADDRESS },
      async () => ({ status: 'unavailable', reason: 'PROVIDER_ERROR' }),
    );
    expect(down.status).toBe('unavailable');
    expect(db.tables.customers?.[0]?.credit_balance).toBe('0');
    expect(db.tables.chain_payments ?? []).toHaveLength(0);
  });

  it('expires a pending top-up once', async () => {
    const db = dbWithBalance();
    const opened = await openWalletTopup(db, {
      customerId: CUSTOMER,
      botId: BOT,
      tenantId: null,
      amountMinor: 1_000_000n,
    });
    const row = db.tables.wallet_topups?.find((item) => item.id === opened.topup.id);
    if (row) {
      row.expires_at = '2020-01-01T00:00:00.000Z';
    }
    expect(await expirePendingTopups(db, new Date('2026-01-01T00:00:00.000Z'))).toBe(1);
    expect(await expirePendingTopups(db, new Date('2026-01-01T00:00:00.000Z'))).toBe(0);
    expect(db.tables.wallet_topups?.[0]?.status).toBe('expired');
  });
});

describe('top-up copy', () => {
  it('escapes the address and states the network warning', () => {
    const text = topupInstructions(
      {
        id: '1',
        customerId: CUSTOMER,
        botId: null,
        tenantId: null,
        amountExpectedMinor: 1_000_000n,
        creditedAmountMinor: null,
        status: 'pending',
        txHash: null,
        network: 'bep20',
        createdAt: new Date('2026-11-11T00:00:00.000Z'),
        expiresAt: new Date('2026-11-11T00:30:00.000Z'),
        creditedAt: null,
        rejectReason: null,
      },
      '0xabc<script>',
      new Date('2026-11-11T00:00:00.000Z'),
    );
    expect(text).toContain('0xabc&lt;script&gt;');
    expect(text).toContain('BNB Smart Chain (BEP20) only');
    expect(text).toContain('1.00 USDT');
    expect(text).not.toContain('<script>');
  });

  it('parses a custom amount and rejects anything under the minimum', () => {
    const limits = { min: TOPUP_FLOOR_MINOR, max: 10_000_000_000n };
    expect(parseTopupAmount('12.50', limits)).toEqual({ ok: true, amountMinor: 12_500_000n });
    expect(parseTopupAmount('0.50', limits).ok).toBe(false);
    expect(parseTopupAmount('<b>', limits).ok).toBe(false);
  });

  it('shows how many confirmations are still missing', () => {
    expect(topupClaimText({ outcome: 'rejected', reason: 'TOO_FEW_CONFIRMATIONS', confirmations: 4 })).toContain('4 of 15');
    expect(topupClaimText({ outcome: 'rejected', reason: 'ALREADY_USED' })).toContain('already used');
  });
});
