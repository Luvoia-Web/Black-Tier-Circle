import { randomInt } from 'crypto';
import { AppError } from '@/lib/errors';

/** 31 characters. Drops 0, 1, i, l, and o so codes are easier to read. */
export const REFERRAL_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const REFERRAL_CODE_LENGTH = 12;

export function generateReferralCode(): string {
  let code = '';
  for (let index = 0; index < REFERRAL_CODE_LENGTH; index += 1) {
    code += REFERRAL_ALPHABET[randomInt(REFERRAL_ALPHABET.length)] ?? 'a';
  }
  return code;
}

export function isReferralCode(value: string): boolean {
  if (value.length !== REFERRAL_CODE_LENGTH) {
    return false;
  }
  return [...value].every((character) => REFERRAL_ALPHABET.includes(character));
}

/**
 * Picks a code that is not already used in this store.
 */
export function nextReferralCode(taken: ReadonlySet<string>, random: () => string = generateReferralCode): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = random();
    if (!taken.has(code)) {
      return code;
    }
  }
  throw new AppError('REFERRAL_CODE_EXHAUSTED', 'Could not create a referral code. Try again.', 500);
}
