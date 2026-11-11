/**
 * Public BEP20 address checks. This module never accepts a private key or seed.
 */

import { ValidationError } from '@/lib/errors';

const RC: readonly bigint[] = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];

const ROTATION = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
];

const MASK = (1n << 64n) - 1n;

export const PUBLIC_ADDRESS_NOTE =
  'Only the public receiving address is needed. Never enter a private key or seed phrase.';

function rotl(value: bigint, bits: number): bigint {
  if (bits === 0) {
    return value & MASK;
  }
  const x = value & MASK;
  return ((x << BigInt(bits)) | (x >> BigInt(64 - bits))) & MASK;
}

function permute(state: BigUint64Array): void {
  for (let round = 0; round < 24; round += 1) {
    const c = [0n, 0n, 0n, 0n, 0n];
    for (let x = 0; x < 5; x += 1) {
      c[x] =
        (state[x] ?? 0n) ^
        (state[x + 5] ?? 0n) ^
        (state[x + 10] ?? 0n) ^
        (state[x + 15] ?? 0n) ^
        (state[x + 20] ?? 0n);
    }
    for (let i = 0; i < 25; i += 1) {
      const x = i % 5;
      state[i] = ((state[i] ?? 0n) ^ (c[(x + 4) % 5] ?? 0n) ^ rotl(c[(x + 1) % 5] ?? 0n, 1)) & MASK;
    }
    const next = new BigUint64Array(25);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const X = y;
        const Y = (2 * x + 3 * y) % 5;
        next[X + 5 * Y] = rotl(state[x + 5 * y] ?? 0n, ROTATION[x + 5 * y] ?? 0);
      }
    }
    const mixed = new BigUint64Array(25);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const index = x + 5 * y;
        mixed[index] =
          (next[index] ?? 0n) ^ (~(next[((x + 1) % 5) + 5 * y] ?? 0n) & (next[((x + 2) % 5) + 5 * y] ?? 0n));
      }
    }
    for (let i = 0; i < 25; i += 1) {
      state[i] = (mixed[i] ?? 0n) & MASK;
    }
    state[0] = ((state[0] ?? 0n) ^ (RC[round] ?? 0n)) & MASK;
  }
}

export function keccak256(message: Uint8Array): Uint8Array {
  const state = new BigUint64Array(25);
  const rate = 136;
  let offset = 0;
  const absorb = (bytes: Uint8Array): void => {
    for (const byte of bytes) {
      const lane = Math.floor(offset / 8);
      const shift = BigInt((offset % 8) * 8);
      state[lane] = ((state[lane] ?? 0n) ^ (BigInt(byte) << shift)) & MASK;
      offset += 1;
      if (offset === rate) {
        permute(state);
        offset = 0;
      }
    }
  };
  absorb(message);
  const pad = new Uint8Array(rate - offset);
  pad[0] = (pad[0] ?? 0) ^ 0x01;
  pad[pad.length - 1] = (pad[pad.length - 1] ?? 0) ^ 0x80;
  absorb(pad);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    const lane = Math.floor(i / 8);
    const shift = BigInt((i % 8) * 8);
    out[i] = Number(((state[lane] ?? 0n) >> shift) & 0xffn);
  }
  return out;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function toChecksumAddress(lowerHex: string): string {
  const body = lowerHex.toLowerCase().replace(/^0x/, '');
  const hash = hex(keccak256(new TextEncoder().encode(body)));
  let out = '0x';
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i] ?? '';
    const nibble = Number.parseInt(hash[i] ?? '0', 16);
    out += nibble >= 8 ? char.toUpperCase() : char;
  }
  return out;
}

export type AddressCheck = {
  readonly address: string | null;
  readonly warning: string | null;
};

/**
 * Empty clears the address. A wrong mixed-case checksum is saved in corrected form
 * and reported as a warning. Anything that is not 0x plus 40 hex is rejected.
 */
export function prepareBep20Address(raw: string | null): AddressCheck {
  if (raw === null) {
    return { address: null, warning: null };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { address: null, warning: null };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new ValidationError(
      'INVALID_ADDRESS',
      'Enter the public BEP20 address only: 0x followed by 40 hex characters. Never paste a private key or seed phrase.',
    );
  }
  const body = trimmed.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) {
    return { address: `0x${body.toLowerCase()}`, warning: null };
  }
  const checksum = toChecksumAddress(body);
  if (trimmed === checksum) {
    return { address: checksum, warning: null };
  }
  return {
    address: checksum,
    warning: 'The mixed-case checksum did not match. The corrected public address was saved.',
  };
}
