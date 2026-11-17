import { describe, expect, it } from 'vitest';
import { priceAfterDiscount } from '@/modules/pricing/discount';

describe('priceAfterDiscount', () => {
  it('applies a percent after the bulk price and stops at the cost floor', () => {
    const priced = priceAfterDiscount({
      quotedRetailMinor: 10_000_000n,
      floorMinor: 8_000_000n,
      quantity: 1,
      kind: 'percent',
      valueMinor: 50n,
    });
    expect(priced.priceMinor).toBe(8_000_000n);
    expect(priced.clamped).toBe(true);
  });

  it('subtracts a fixed amount when it stays above the floor', () => {
    const priced = priceAfterDiscount({
      quotedRetailMinor: 10_000_000n,
      floorMinor: 4_000_000n,
      quantity: 2,
      kind: 'fixed',
      valueMinor: 1_000_000n,
    });
    expect(priced.priceMinor).toBe(9_000_000n);
    expect(priced.clamped).toBe(false);
  });
});
