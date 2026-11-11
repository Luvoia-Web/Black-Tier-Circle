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
  orderCryptoTopupMinor,
  TOPUP_BUSY_MESSAGE,
  TOPUP_FLOOR_MINOR,
} from '@/modules/topups';
import { EXACT_AMOUNT_WARNING, parseTopupAmount, topupClaimText, topupInstructions } from '@/modules/topups/screens';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const CUSTOMER = '00000000-0000-4000-8000-000000000301';
const OTHER = '00000000-0000-4000-8000-000000000302';
const BOT = '00000000-0000-4000-8000-000000000201';
const OTHER_BOT = '00000000-0000-4000-8000-000000000202';
const ADDRESS = '0x1111111111111111111111111111111111111111';
const OTHER_ADDRESS = '0x3333333333333333333333333333333333333333';
const HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function open(
  db: ReturnType<typeof dbWithBalance>,
  input: {
    readonly customerId?: string;
    readonly botId?: string;
    readonly amountMinor: bigint;
    readonly payToAddress?: string;
    readonly pickTag?: () => bigint;
  },
) {
  return openWalletTopup(
    db,
    {
      customerId: input.customerId ?? CUSTOMER,
      botId: input.botId ?? BOT,
      tenantId: null,
      amountMinor: input.amountMinor,
      payToAddress: input.payToAddress ?? ADDRESS,
    },
    { pickTag: input.pickTag ?? (() => 100n) },
  );
}

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
    const first = await open(db, { amountMinor: 5_000_000n });
    const second = await open(db, { amountMinor: 10_000_000n });
    expect(second.reused).toBe(true);
    expect(second.topup.id).toBe(first.topup.id);
    expect(second.topup.amountExpectedMinor).toBe(5_000_100n);
    expect(db.tables.wallet_topups).toHaveLength(1);
  });

  it('rejects an amount below 1.00 USDT', async () => {
    const db = dbWithBalance();
    await expect(open(db, { amountMinor: 500_000n })).rejects.toBeInstanceOf(ValidationError);
  });

  it('credits the exact expected amount once and refuses the same hash on another top-up', async () => {
    const db = dbWithBalance();
    const opened = await open(db, { amountMinor: 1_000_000n });
    expect(opened.topup.amountExpectedMinor).toBe(1_000_100n);
    let lookups = 0;
    const verify = async (): Promise<VerifyUsdtTransferResult> => {
      lookups += 1;
      return verified(opened.topup.amountExpectedMinor);
    };
    const first = await claimWalletTopup(db, { customerId: CUSTOMER, txHash: HASH }, verify);
    const second = await claimWalletTopup(db, { customerId: CUSTOMER, txHash: HASH }, verify);
    expect(first.status).toBe('credited');
    expect(second.status).toBe('credited');
    if (second.status === 'credited') {
      expect(second.repeated).toBe(true);
      expect(second.newBalance).toBe(1_000_100n);
    }
    expect(lookups).toBe(1);
    expect(db.tables.customers?.[0]?.credit_balance).toBe('1000100');
    expect(db.tables.chain_payments).toHaveLength(1);

    const again = await open(db, { amountMinor: 1_000_000n });
    expect(again.reused).toBe(false);
    const replay = await claimWalletTopup(db, { customerId: CUSTOMER, txHash: HASH }, async () =>
      verified(again.topup.amountExpectedMinor),
    );
    expect(replay).toMatchObject({ status: 'rejected', reason: 'ALREADY_USED' });
    expect(db.tables.customers?.[0]?.credit_balance).toBe('1000100');
  });

  it('rejects both a larger and a smaller transfer', async () => {
    const db = dbWithBalance();
    const opened = await open(db, { amountMinor: 1_000_000n });
    const over = await claimWalletTopup(db, { customerId: CUSTOMER, txHash: HASH }, async () =>
      verified(opened.topup.amountExpectedMinor + 1n),
    );
    expect(over).toMatchObject({ status: 'rejected', reason: 'AMOUNT_MISMATCH' });
    const under = await claimWalletTopup(db, { customerId: CUSTOMER, txHash: HASH }, async () =>
      verified(opened.topup.amountExpectedMinor - 1n),
    );
    expect(under).toMatchObject({ status: 'rejected', reason: 'AMOUNT_MISMATCH' });
    const direct = await db.rpc('credit_wallet_topup', {
      p_topup_id: opened.topup.id,
      p_tx_hash: HASH,
      p_amount_minor: (opened.topup.amountExpectedMinor + 5n).toString(),
      p_network: 'bep20',
      p_exact: true,
    });
    const row = Array.isArray(direct.data) ? direct.data[0] : null;
    expect(row).toMatchObject({ success: false, error_code: 'AMOUNT_MISMATCH' });
    expect(db.tables.customers?.[0]?.credit_balance).toBe('0');
    expect(db.tables.chain_payments ?? []).toHaveLength(0);
  });

  it('does not let a smaller pending top-up claim someone else’s larger transfer', async () => {
    const db = createMemoryDb({
      customers: [
        { id: CUSTOMER, bot_id: BOT, credit_balance: '0', first_name: 'A' },
        { id: OTHER, bot_id: OTHER_BOT, credit_balance: '0', first_name: 'B' },
      ],
    });
    const buyerA = await open(db, { customerId: CUSTOMER, amountMinor: 10_000_000n, pickTag: () => 4200n });
    const buyerB = await open(db, {
      customerId: OTHER,
      botId: OTHER_BOT,
      amountMinor: 1_000_000n,
      pickTag: () => 1300n,
    });
    expect(buyerA.topup.amountExpectedMinor).toBe(10_004_200n);
    expect(buyerB.topup.amountExpectedMinor).toBe(1_001_300n);
    const stolen = await claimWalletTopup(db, { customerId: OTHER, txHash: HASH }, async () => verified(10_004_200n));
    expect(stolen).toMatchObject({
      status: 'rejected',
      reason: 'AMOUNT_MISMATCH',
      amountMinor: 10_004_200n,
      expectedMinor: 1_001_300n,
    });
    expect(db.tables.chain_payments ?? []).toHaveLength(0);
    const own = await claimWalletTopup(db, { customerId: CUSTOMER, txHash: HASH }, async () => verified(10_004_200n));
    expect(own.status).toBe('credited');
    if (own.status === 'credited') {
      expect(own.amountMinor).toBe(10_004_200n);
    }
    expect(db.tables.customers?.find((row) => row.id === CUSTOMER)?.credit_balance).toBe('10004200');
    expect(db.tables.customers?.find((row) => row.id === OTHER)?.credit_balance).toBe('0');
  });

  it('keeps tagged amounts unique per receiving address, including two bots on one address', async () => {
    const db = createMemoryDb({
      customers: [
        { id: CUSTOMER, credit_balance: '0' },
        { id: OTHER, credit_balance: '0' },
        { id: '00000000-0000-4000-8000-000000000303', credit_balance: '0' },
      ],
    });
    const tags = [4200n, 4200n, 1300n];
    let index = 0;
    const first = await open(db, { amountMinor: 10_000_000n, pickTag: () => tags[index++] ?? 4200n });
    const shared = await open(db, {
      customerId: OTHER,
      botId: OTHER_BOT,
      amountMinor: 10_000_000n,
      pickTag: () => tags[index++] ?? 1300n,
    });
    expect(shared.topup.amountExpectedMinor).toBe(10_001_300n);
    expect(shared.topup.amountExpectedMinor).not.toBe(first.topup.amountExpectedMinor);
    expect(shared.topup.payToAddress).toBe(ADDRESS);
    const elsewhere = await open(db, {
      customerId: '00000000-0000-4000-8000-000000000303',
      botId: OTHER_BOT,
      amountMinor: 10_000_000n,
      payToAddress: OTHER_ADDRESS,
      pickTag: () => 4200n,
    });
    expect(elsewhere.topup.amountExpectedMinor).toBe(first.topup.amountExpectedMinor);
    expect(elsewhere.topup.payToAddress).toBe(OTHER_ADDRESS);
  });

  it('retries when the tag is already pending and stops after 20 collisions', async () => {
    const db = dbWithBalance();
    await open(db, { customerId: OTHER, amountMinor: 1_000_000n, pickTag: () => 4200n });
    const calls: bigint[] = [];
    const retried = await open(db, {
      amountMinor: 1_000_000n,
      pickTag: () => {
        const tag = calls.length === 0 ? 4200n : 1300n;
        calls.push(tag);
        return tag;
      },
    });
    expect(calls).toEqual([4200n, 1300n]);
    expect(retried.topup.amountExpectedMinor).toBe(1_001_300n);

    const stuck = dbWithBalance();
    await open(stuck, { customerId: OTHER, amountMinor: 1_000_000n, pickTag: () => 4200n });
    await expect(open(stuck, { amountMinor: 1_000_000n, pickTag: () => 4200n })).rejects.toMatchObject({
      code: 'TOPUP_BUSY',
      message: TOPUP_BUSY_MESSAGE,
    });
    expect(stuck.tables.wallet_topups).toHaveLength(1);
  });

  it('does not credit when the transfer is too early or the provider is down', async () => {
    const db = dbWithBalance();
    await open(db, { amountMinor: 1_000_000n });
    const early = await claimWalletTopup(db, { customerId: CUSTOMER, txHash: HASH }, async () => ({
      status: 'rejected',
      reason: 'TOO_EARLY',
    }));
    expect(early).toMatchObject({ status: 'rejected', reason: 'TOO_EARLY' });
    const down = await claimWalletTopup(db, { customerId: CUSTOMER, txHash: HASH }, async () => ({
      status: 'unavailable',
      reason: 'PROVIDER_ERROR',
    }));
    expect(down.status).toBe('unavailable');
    expect(db.tables.customers?.[0]?.credit_balance).toBe('0');
    expect(db.tables.chain_payments ?? []).toHaveLength(0);
  });

  it('expires a pending top-up once', async () => {
    const db = dbWithBalance();
    const opened = await open(db, { amountMinor: 1_000_000n });
    const row = db.tables.wallet_topups?.find((item) => item.id === opened.topup.id);
    if (row) {
      row.expires_at = '2020-01-01T00:00:00.000Z';
    }
    expect(await expirePendingTopups(db, new Date('2026-01-01T00:00:00.000Z'))).toBe(1);
    expect(await expirePendingTopups(db, new Date('2026-01-01T00:00:00.000Z'))).toBe(0);
    expect(db.tables.wallet_topups?.[0]?.status).toBe('expired');
  });
});

describe('crypto checkout amount', () => {
  it('uses the order total when the balance is zero and the shortfall otherwise', () => {
    expect(orderCryptoTopupMinor(10_000_000n, 0n, TOPUP_FLOOR_MINOR)).toBe(10_000_000n);
    expect(orderCryptoTopupMinor(10_000_000n, 4_000_000n, TOPUP_FLOOR_MINOR)).toBe(6_000_000n);
    expect(orderCryptoTopupMinor(10_000_000n, 10_000_000n, TOPUP_FLOOR_MINOR)).toBeNull();
    expect(orderCryptoTopupMinor(500_000n, 0n, TOPUP_FLOOR_MINOR)).toBe(TOPUP_FLOOR_MINOR);
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
        payToAddress: null,
        amountExpectedMinor: 1_000_100n,
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
    expect(text).toContain(`<b>${EXACT_AMOUNT_WARNING}</b>`);
    expect(text).toContain('<code>1.000100 USDT</code>');
    expect(text).toContain('30 minutes');
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
    expect(
      topupClaimText({
        outcome: 'rejected',
        reason: 'AMOUNT_MISMATCH',
        amountMinor: 10_004_200n,
        expectedMinor: 1_001_300n,
      }),
    ).toContain('The amount sent was 10.004200 USDT, but this top-up expects exactly 1.001300 USDT.');
    expect(topupClaimText({ outcome: 'rejected', reason: 'AMOUNT_MISMATCH', amountMinor: 1n, expectedMinor: 2n })).toContain(
      'Contact /support',
    );
  });
});
