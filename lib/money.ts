/**
 * @file lib/money.ts
 *
 * Integer USDT math in minor units (6 decimal places).
 *
 * All money in this platform is stored and computed as bigint minor units
 * so floating-point rounding cannot corrupt balances, prices, or ledger rows.
 * Callers in wallet, pricing, and payment modules must use these helpers
 * instead of inline arithmetic.
 *
 * @module Money
 */

import { ValidationError, WalletError } from '@/lib/errors';

/** USDT uses 6 decimal places. */
export const USDT_DECIMALS = 6;

/** 1 USDT = 1_000_000 minor units. INVARIANT: never use number for this factor. */
export const USDT_FACTOR = 1_000_000n;

const USDT_STRING_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Converts a human-readable USDT decimal string to minor units.
 *
 * @param usdt - Decimal string such as "1.5", "0.000001", or "100"
 * @returns Amount in USDT minor units
 * @throws ValidationError when the string is not a valid USDT amount
 *
 * INVARIANT: More than 6 decimal places is rejected, never rounded.
 */
export function usdtToMinor(usdt: string): bigint {
  const trimmed = usdt.trim();
  if (!USDT_STRING_PATTERN.test(trimmed)) {
    throw new ValidationError('INVALID_USDT', `Invalid USDT amount: ${usdt}`);
  }

  const parts = trimmed.split('.');
  const wholePart = parts[0] ?? '0';
  const fractionPart = parts[1];

  if (fractionPart !== undefined && fractionPart.length > USDT_DECIMALS) {
    throw new ValidationError(
      'USDT_TOO_MANY_DECIMALS',
      `USDT amounts cannot have more than ${USDT_DECIMALS} decimal places`,
    );
  }

  const paddedFraction = (fractionPart ?? '').padEnd(USDT_DECIMALS, '0');
  return BigInt(wholePart) * USDT_FACTOR + BigInt(paddedFraction);
}

/**
 * Converts minor units back to a fixed 6-decimal USDT string.
 *
 * @param minor - Amount in USDT minor units
 * @returns Display string such as "1.500000"
 */
export function minorToUsdt(minor: bigint): string {
  const isNegative = minor < 0n;
  const absolute = isNegative ? -minor : minor;
  const whole = absolute / USDT_FACTOR;
  const fraction = (absolute % USDT_FACTOR).toString().padStart(USDT_DECIMALS, '0');
  const sign = isNegative ? '-' : '';
  return `${sign}${whole.toString()}.${fraction}`;
}

/**
 * Adds two USDT minor-unit amounts using bigint only.
 *
 * @param leftMinor - Left operand in minor units
 * @param rightMinor - Right operand in minor units
 * @returns Sum in minor units
 *
 * INVARIANT: Addition never goes through JavaScript number, so
 * Number.MAX_SAFE_INTEGER + 1 remains exact.
 */
export function addUsdt(leftMinor: bigint, rightMinor: bigint): bigint {
  return leftMinor + rightMinor;
}

/**
 * Subtracts USDT minor units and rejects a negative result.
 *
 * @param leftMinor - Minuend in minor units
 * @param rightMinor - Subtrahend in minor units
 * @returns Difference in minor units
 * @throws WalletError when the result would be negative
 */
export function subtractUsdt(leftMinor: bigint, rightMinor: bigint): bigint {
  if (rightMinor > leftMinor) {
    throw new WalletError(
      'NEGATIVE_USDT_RESULT',
      'USDT subtraction would produce a negative amount',
      400,
    );
  }
  return leftMinor - rightMinor;
}

/**
 * Formats minor units for UI display with a currency label.
 *
 * @param minor - Amount in USDT minor units
 * @returns String such as "1.50 USDT"
 */
export function formatUsdt(minor: bigint): string {
  const isNegative = minor < 0n;
  const absolute = isNegative ? -minor : minor;
  const whole = absolute / USDT_FACTOR;
  const cents = (absolute % USDT_FACTOR) / 10_000n;
  const sign = isNegative ? '-' : '';
  return `${sign}${whole.toString()}.${cents.toString().padStart(2, '0')} USDT`;
}
