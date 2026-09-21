/**
 * @file tests/unit/tokens.test.ts
 *
 * Unit tests for 12-digit top-up token format rules.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { generateTopupToken, isValidTokenFormat } from '@/lib/tokens';

describe('generateTopupToken', () => {
  it('should generate a token that is exactly 12 characters', () => {
    expect(generateTopupToken()).toHaveLength(12);
  });

  it('should generate a token that is all digits', () => {
    expect(/^\d{12}$/.test(generateTopupToken())).toBe(true);
  });

  it('should generate a token that does not start with 0', () => {
    expect(generateTopupToken().startsWith('0')).toBe(false);
  });
});

describe('isValidTokenFormat', () => {
  it('should accept a 12-digit token with no leading zero', () => {
    expect(isValidTokenFormat('123456789012')).toBe(true);
  });

  it('should reject an 11-digit token', () => {
    expect(isValidTokenFormat('12345678901')).toBe(false);
  });

  it('should reject tokens that contain letters', () => {
    expect(isValidTokenFormat('0123456789ab')).toBe(false);
  });

  it('should reject a 12-digit token with a leading zero', () => {
    expect(isValidTokenFormat('012345678901')).toBe(false);
  });
});
