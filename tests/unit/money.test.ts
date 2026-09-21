/**
 * @file tests/unit/money.test.ts
 *
 * Unit tests for integer USDT helpers.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { addUsdt, minorToUsdt, subtractUsdt, usdtToMinor } from '@/lib/money';

describe('usdtToMinor', () => {
  it('should convert whole USDT to minor units', () => {
    expect(usdtToMinor('1')).toBe(1_000_000n);
  });

  it('should convert the smallest USDT increment to 1n', () => {
    expect(usdtToMinor('0.000001')).toBe(1n);
  });

  it('should convert one and a half USDT to 1_500_000n', () => {
    expect(usdtToMinor('1.5')).toBe(1_500_000n);
  });

  it('should throw when more than 6 decimal places are provided', () => {
    expect(() => usdtToMinor('1.0000001')).toThrow();
  });

  it('should throw on non-numeric input', () => {
    expect(() => usdtToMinor('abc')).toThrow();
  });
});

describe('minorToUsdt', () => {
  it('should format minor units with six decimal places', () => {
    expect(minorToUsdt(1_500_000n)).toBe('1.500000');
  });
});

describe('subtractUsdt', () => {
  it('should throw when the result would be negative', () => {
    expect(() => subtractUsdt(5n, 6n)).toThrow();
  });
});

describe('addUsdt', () => {
  it('should add beyond Number.MAX_SAFE_INTEGER without float corruption', () => {
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    expect(addUsdt(maxSafe, 1n)).toBe(maxSafe + 1n);
    expect(addUsdt(maxSafe, 1n) === maxSafe + 1n).toBe(true);
  });
});
