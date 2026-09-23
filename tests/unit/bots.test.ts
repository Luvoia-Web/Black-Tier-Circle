/**
 * @file tests/unit/bots.test.ts
 *
 * Unit tests for bot token encryption, customer upsert, and Telegram connect.
 *
 * @module Tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { decrypt, encrypt } from '@/lib/encryption';
import { verifyTelegramSecret } from '@/integrations/telegram/webhook';
import { connectBot, getOrCreateCustomer } from '@/modules/bots';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('encrypt/decrypt', () => {
  it('encrypt and decrypt are inverse operations', () => {
    const token = '111:AAFakeTelegramBotToken';
    expect(decrypt(encrypt(token))).toBe(token);
  });

  it('encrypt produces different ciphertext on each call (random IV)', () => {
    const token = '111:AAFakeTelegramBotToken';
    expect(encrypt(token)).not.toBe(encrypt(token));
  });
});

describe('getOrCreateCustomer', () => {
  it('upserts on (botId, telegramUserId)', async () => {
    const db = createMemoryDb();
    const botId = '00000000-0000-4000-8000-000000000201';
    const first = await getOrCreateCustomer(db, botId, {
      id: 42,
      first_name: 'Ada',
      username: 'ada',
    });
    const second = await getOrCreateCustomer(db, botId, {
      id: 42,
      first_name: 'Ada Lovelace',
      username: 'adal',
    });
    expect(second.id).toBe(first.id);
    expect(second.firstName).toBe('Ada Lovelace');
    expect(second.username).toBe('adal');
    expect(db.tables.customers).toHaveLength(1);
  });

  it('creates an owner-store customer with a null bot_id', async () => {
    const db = createMemoryDb();
    const customer = await getOrCreateCustomer(db, 'owner', {
      id: 99,
      first_name: 'OwnerBuyer',
    });
    expect(customer.botId).toBe('owner');
    expect(db.tables.customers).toEqual([expect.objectContaining({ bot_id: null, telegram_user_id: '99' })]);
  });
});

describe('connectBot', () => {
  it('throws WEBHOOK_URL_NOT_PUBLIC when the app URL is localhost', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    const db = createMemoryDb();
    await expect(
      connectBot(db, { tenantId: '00000000-0000-4000-8000-000000000010', botToken: '111:AAFakeTelegramBotToken' }),
    ).rejects.toMatchObject({ code: 'WEBHOOK_URL_NOT_PUBLIC' });
  });

  it('throws AppError with invalid token', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({ ok: false, error_code: 401, description: 'Unauthorized' }),
      })),
    );
    const db = createMemoryDb();
    await expect(
      connectBot(db, { tenantId: '00000000-0000-4000-8000-000000000010', botToken: 'invalid-token-value-12345' }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('webhook secret', () => {
  it('rejects a missing or wrong secret header', () => {
    expect(verifyTelegramSecret('abc', null)).toBe(false);
    expect(verifyTelegramSecret('abc', 'wrong')).toBe(false);
    expect(verifyTelegramSecret('secret-token-value', 'secret-token-value')).toBe(true);
  });
});
