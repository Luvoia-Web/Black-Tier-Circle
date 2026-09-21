/**
 * @file lib/tokens.ts
 *
 * Cryptographically random 12-digit top-up token helpers.
 *
 * Admins generate these tokens so resellers can credit USDT wallets
 * without sharing payment credentials. Format validation lives here;
 * uniqueness and redemption state live in the database.
 *
 * @module Tokens
 */

import { randomBytes } from 'node:crypto';

const TOKEN_LENGTH = 12;
const TWELVE_DIGIT_MIN = 100_000_000_000n;
const TWELVE_DIGIT_SPAN = 900_000_000_000n;

/**
 * Generates a cryptographically random 12-digit numeric top-up token.
 *
 * Tokens are used by admins to load credit into reseller wallets.
 * They are entered directly in the Telegram bot or dashboard.
 * 12 digits gives ~900 billion possible values, making brute-force
 * guessing infeasible within any practical window.
 *
 * @returns A 12-digit string that does not start with zero
 *
 * INVARIANT: Output is always exactly 12 characters, all numeric, no leading zero.
 * SECURITY: Uses crypto.randomBytes — never Math.random() for tokens.
 */
export function generateTopupToken(): string {
  let token = '';
  do {
    const bytes = randomBytes(8);
    const numericValue =
      (bytes.readBigUInt64BE() % TWELVE_DIGIT_SPAN) + TWELVE_DIGIT_MIN;
    token = numericValue.toString();
  } while (token.length !== TOKEN_LENGTH || token.startsWith('0'));
  return token;
}

/**
 * Validates top-up token format only — not existence or redemption state.
 *
 * @param token - Candidate token string
 * @returns True when the token is exactly 12 digits and has no leading zero
 */
export function isValidTokenFormat(token: string): boolean {
  return /^[1-9][0-9]{11}$/.test(token);
}
