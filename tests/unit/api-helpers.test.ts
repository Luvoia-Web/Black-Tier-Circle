/**
 * @file tests/unit/api-helpers.test.ts
 *
 * Unit tests for bigint JSON serialization.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { serializeForJson } from '@/lib/api-helpers';

describe('serializeForJson', () => {
  it('converts bigint to string', () => {
    expect(serializeForJson({ amount: 10_500_000n })).toEqual({ amount: '10500000' });
  });

  it('handles nested objects with bigint', () => {
    expect(
      serializeForJson({
        product: { wholesalePriceMinor: 5_000_000n, nested: { retailPriceMinor: 9n } },
      }),
    ).toEqual({
      product: { wholesalePriceMinor: '5000000', nested: { retailPriceMinor: '9' } },
    });
  });

  it('handles arrays of objects with bigint', () => {
    expect(
      serializeForJson([
        { wholesalePriceMinor: 1n },
        { wholesalePriceMinor: 2n },
      ]),
    ).toEqual([{ wholesalePriceMinor: '1' }, { wholesalePriceMinor: '2' }]);
  });
});
