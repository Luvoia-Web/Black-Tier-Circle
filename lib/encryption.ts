/**
 * @file lib/encryption.ts
 *
 * AES-256-GCM encryption for sensitive values stored in the database.
 * Used to encrypt Telegram bot tokens before storing in bot_connections.
 *
 * The encryption key comes from BOT_TOKEN_ENCRYPTION_KEY env var (32 bytes, hex-encoded).
 * Generate with: openssl rand -hex 32
 *
 * SECURITY: The encrypted token is useless without the key.
 * Never log the key or the plaintext token.
 * Never return the plaintext or encrypted token in API responses.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // bytes

function getEncryptionKey(): Buffer {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.BOT_TOKEN_ENCRYPTION_KEY ||
      process.env.BOT_TOKEN_ENCRYPTION_KEY.startsWith('PLACEHOLDER'))
  ) {
    throw new Error('BOT_TOKEN_ENCRYPTION_KEY is not set. Refusing to start in production.');
  }
  const keyHex = process.env.BOT_TOKEN_ENCRYPTION_KEY;
  if (!keyHex || keyHex.startsWith('PLACEHOLDER')) {
    // In development with placeholder key, use a deterministic dev key
    // SECURITY: This dev key must NEVER be used in production
    console.warn(
      '[SECURITY] Using dev encryption key — set BOT_TOKEN_ENCRYPTION_KEY in production',
    );
    return Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`BOT_TOKEN_ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters`);
  }
  return key;
}

/** Encrypts a plaintext string. Returns base64-encoded ciphertext with IV + auth tag. */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv + authTag + encrypted)
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/** Decrypts a base64-encoded ciphertext produced by encrypt(). */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
