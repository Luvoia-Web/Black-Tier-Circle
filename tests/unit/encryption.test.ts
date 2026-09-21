/**
 * @file tests/unit/encryption.test.ts
 *
 * Unit tests for AES-256-GCM token encryption.
 *
 * @module Tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { decrypt, encrypt } from '@/lib/encryption';

const ORIGINAL_KEY = process.env.BOT_TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.BOT_TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.BOT_TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
  vi.restoreAllMocks();
});

describe('encryption', () => {
  it('encrypt/decrypt roundtrip preserves original string', () => {
    const original = '123456789:AATestBotTokenValue';
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it('encrypt produces different ciphertext on each call (random IV)', () => {
    const original = '123456789:AATestBotTokenValue';
    expect(encrypt(original)).not.toBe(encrypt(original));
  });

  it('decrypt with tampered ciphertext throws (GCM auth tag check)', () => {
    const ciphertext = encrypt('secret-value');
    const buffer = Buffer.from(ciphertext, 'base64');
    const lastIndex = buffer.length - 1;
    const last = buffer[lastIndex];
    if (last !== undefined) {
      buffer[lastIndex] = last === 0 ? 1 : 0;
    }
    const tampered = buffer.toString('base64');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('placeholder key in dev produces warning (console.warn spy)', () => {
    process.env.BOT_TOKEN_ENCRYPTION_KEY = 'PLACEHOLDER_64_HEX_CHARS_GENERATE_WITH_OPENSSL';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    encrypt('token');
    expect(warn).toHaveBeenCalled();
    const message = warn.mock.calls[0]?.[0];
    expect(String(message)).toContain('[SECURITY] Using dev encryption key');
  });
});
