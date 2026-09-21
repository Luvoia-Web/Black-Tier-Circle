/**
 * @file tests/unit/wallet.test.ts
 *
 * Unit tests for wallet balances, token redemption, ledger reads, and USDT display.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { ValidationError, WalletError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import {
  createTopupToken,
  getLedgerEntries,
  getWallet,
  getWalletStatement,
  listTopupTokens,
  redeemTopupToken,
  reserveFunds,
  revokeTopupToken,
} from '@/modules/wallet';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const TENANT_ID = '00000000-0000-4000-8000-000000000010';
const WALLET_ID = '00000000-0000-4000-8000-000000000020';
const ACTOR_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ORDER_ID = '00000000-0000-4000-8000-000000000030';

function seedWallet(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof createMemoryDb> {
  return createMemoryDb({
    wallets: [
      {
        id: WALLET_ID,
        tenant_id: TENANT_ID,
        balance_total: '1000000',
        balance_reserved: '300000',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        ...overrides,
      },
    ],
  });
}

describe('WALLET OPERATIONS', () => {
  it('getWallet computes balanceAvailable = balanceTotal - balanceReserved correctly', async () => {
    const db = seedWallet();
    const wallet = await getWallet(db, TENANT_ID);
    expect(wallet.balanceAvailable).toBe(wallet.balanceTotal - wallet.balanceReserved);
  });

  it('getWallet with balanceTotal=1000000n, balanceReserved=300000n → balanceAvailable=700000n', async () => {
    const db = seedWallet();
    const wallet = await getWallet(db, TENANT_ID);
    expect(wallet.balanceTotal).toBe(1_000_000n);
    expect(wallet.balanceReserved).toBe(300_000n);
    expect(wallet.balanceAvailable).toBe(700_000n);
  });

  it('redeemTopupToken with TOKEN_NOT_FOUND returns success=false, no throw', async () => {
    const db = seedWallet();
    const result = await redeemTopupToken(db, '123456789012', TENANT_ID, USER_ID);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TOKEN_NOT_FOUND');
  });

  it('redeemTopupToken with TOKEN_REDEEMED returns success=false, no throw', async () => {
    const db = createMemoryDb({
      wallets: [
        {
          id: WALLET_ID,
          tenant_id: TENANT_ID,
          balance_total: '1000000',
          balance_reserved: '300000',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      topup_tokens: [
        {
          id: 'tok-1',
          token: '123456789012',
          amount_usdt: '50000000',
          status: 'redeemed',
          tenant_id: null,
          created_by: ACTOR_ID,
          redeemed_by: USER_ID,
          redeemed_at: '2026-01-02T00:00:00.000Z',
          expires_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const result = await redeemTopupToken(db, '123456789012', TENANT_ID, USER_ID);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TOKEN_REDEEMED');
  });

  it('reserveFunds with insufficient balance throws WalletError', async () => {
    const db = seedWallet({ balance_total: '1000000', balance_reserved: '0' });
    await expect(
      reserveFunds(db, WALLET_ID, ORDER_ID, 2_000_000n, new Date('2026-02-01T00:00:00.000Z')),
    ).rejects.toBeInstanceOf(WalletError);
  });
});

describe('LEDGER', () => {
  it('getLedgerEntries returns entries newest first', async () => {
    const db = createMemoryDb({
      wallets: [
        {
          id: WALLET_ID,
          tenant_id: TENANT_ID,
          balance_total: '5000000',
          balance_reserved: '0',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-03T00:00:00.000Z',
        },
      ],
      ledger_transactions: [
        {
          id: 'led-1',
          wallet_id: WALLET_ID,
          entry_type: 'top_up_credit',
          amount: '1000000',
          balance_after: '1000000',
          reference_id: null,
          reference_type: null,
          actor_id: null,
          note: 'older',
          created_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'led-2',
          wallet_id: WALLET_ID,
          entry_type: 'manual_credit',
          amount: '4000000',
          balance_after: '5000000',
          reference_id: null,
          reference_type: null,
          actor_id: null,
          note: 'newer',
          created_at: '2026-01-03T00:00:00.000Z',
        },
      ],
    });
    const entries = await getLedgerEntries(db, WALLET_ID);
    expect(entries[0]?.id).toBe('led-2');
    expect(entries[1]?.id).toBe('led-1');
  });

  it('getWalletStatement computes totalCredits correctly (sum of positive amounts)', async () => {
    const db = createMemoryDb({
      wallets: [
        {
          id: WALLET_ID,
          tenant_id: TENANT_ID,
          balance_total: '3000000',
          balance_reserved: '0',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
      ledger_transactions: [
        {
          id: 'c1',
          wallet_id: WALLET_ID,
          entry_type: 'top_up_credit',
          amount: '2000000',
          balance_after: '2000000',
          reference_id: null,
          reference_type: null,
          actor_id: null,
          note: null,
          created_at: '2026-01-01T12:00:00.000Z',
        },
        {
          id: 'd1',
          wallet_id: WALLET_ID,
          entry_type: 'manual_debit',
          amount: '-500000',
          balance_after: '1500000',
          reference_id: null,
          reference_type: null,
          actor_id: null,
          note: null,
          created_at: '2026-01-01T13:00:00.000Z',
        },
        {
          id: 'c2',
          wallet_id: WALLET_ID,
          entry_type: 'manual_credit',
          amount: '1500000',
          balance_after: '3000000',
          reference_id: null,
          reference_type: null,
          actor_id: null,
          note: null,
          created_at: '2026-01-01T14:00:00.000Z',
        },
      ],
    });
    const statement = await getWalletStatement(
      db,
      WALLET_ID,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-02T00:00:00.000Z'),
    );
    expect(statement.totalCredits).toBe(3_500_000n);
  });

  it('getWalletStatement computes totalDebits correctly (sum of absolute negative amounts)', async () => {
    const db = createMemoryDb({
      wallets: [
        {
          id: WALLET_ID,
          tenant_id: TENANT_ID,
          balance_total: '500000',
          balance_reserved: '0',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
      ledger_transactions: [
        {
          id: 'd1',
          wallet_id: WALLET_ID,
          entry_type: 'manual_debit',
          amount: '-200000',
          balance_after: '800000',
          reference_id: null,
          reference_type: null,
          actor_id: null,
          note: null,
          created_at: '2026-01-01T12:00:00.000Z',
        },
        {
          id: 'd2',
          wallet_id: WALLET_ID,
          entry_type: 'wholesale_debit',
          amount: '-300000',
          balance_after: '500000',
          reference_id: null,
          reference_type: null,
          actor_id: null,
          note: null,
          created_at: '2026-01-01T13:00:00.000Z',
        },
      ],
    });
    const statement = await getWalletStatement(
      db,
      WALLET_ID,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-02T00:00:00.000Z'),
    );
    expect(statement.totalDebits).toBe(500_000n);
  });
});

describe('TOKEN', () => {
  it('createTopupToken generates exactly 12-digit token', async () => {
    const db = createMemoryDb();
    const token = await createTopupToken(db, ACTOR_ID, { amountUsdt: 50_000_000n });
    expect(token.token).toHaveLength(12);
    expect(/^[1-9][0-9]{11}$/.test(token.token)).toBe(true);
  });

  it('createTopupToken with amountUsdt=0 throws ValidationError', async () => {
    const db = createMemoryDb();
    await expect(createTopupToken(db, ACTOR_ID, { amountUsdt: 0n })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('listTopupTokens filters by status correctly', async () => {
    const db = createMemoryDb();
    const active = await createTopupToken(db, ACTOR_ID, { amountUsdt: 1_000_000n });
    await createTopupToken(db, ACTOR_ID, { amountUsdt: 2_000_000n });
    await revokeTopupToken(db, active.id, ACTOR_ID);
    const listed = await listTopupTokens(db, { status: 'revoked' });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.status).toBe('revoked');
  });

  it('revokeTopupToken changes status to revoked', async () => {
    const db = createMemoryDb();
    const created = await createTopupToken(db, ACTOR_ID, { amountUsdt: 1_000_000n });
    const revoked = await revokeTopupToken(db, created.id, ACTOR_ID);
    expect(revoked.status).toBe('revoked');
  });
});

describe('MONEY DISPLAY', () => {
  it('formatUsdt(10_500_000n) → "10.50 USDT"', () => {
    expect(formatUsdt(10_500_000n)).toBe('10.50 USDT');
  });

  it('formatUsdt(0n) → "0.00 USDT"', () => {
    expect(formatUsdt(0n)).toBe('0.00 USDT');
  });

  it('formatUsdt(1n) → "0.00 USDT" (sub-cent, rounds down for display)', () => {
    expect(formatUsdt(1n)).toBe('0.00 USDT');
  });
});
