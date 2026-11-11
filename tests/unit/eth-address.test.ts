import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { keccak256, prepareBep20Address, toChecksumAddress } from '@/lib/eth-address';

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('public BEP20 addresses', () => {
  it('hashes an empty message with keccak256', () => {
    expect(hex(keccak256(new Uint8Array()))).toBe(
      'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
    );
  });

  it('builds the checksum for a known address', () => {
    expect(toChecksumAddress('5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe(
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    );
  });

  it('accepts lowercase and uppercase without a warning', () => {
    expect(prepareBep20Address('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed').warning).toBeNull();
    expect(prepareBep20Address('0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED').address).toBe(
      '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',
    );
  });

  it('warns and corrects a mixed-case address with a bad checksum', () => {
    const result = prepareBep20Address('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD');
    expect(result.warning).toContain('checksum');
    expect(result.address).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  });

  it('rejects a private key and a seed phrase', () => {
    expect(() => prepareBep20Address(`0x${'ab'.repeat(32)}`)).toThrow(ValidationError);
    expect(() => prepareBep20Address('abandon abandon abandon abandon abandon abandon')).toThrow(ValidationError);
  });

  it('clears a blank address', () => {
    expect(prepareBep20Address('  ').address).toBeNull();
  });
});
