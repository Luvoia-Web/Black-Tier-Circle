/**
 * Bulk discount math. Every quote is bigint minor units.
 * The highest tier whose min quantity is met prices every unit.
 * Percent-off helper: price = base * (10000 - hundredths) / 10000.
 * Integer division rounds the unit price down, in the buyer's favour.
 */

import { ValidationError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';

export const MAX_BULK_TIERS = 5;
const OWNER_STORE_KEY = '00000000-0000-0000-0000-000000000000';

export type BulkTier = {
  readonly minQty: number;
  readonly unitPriceMinor: bigint;
};

export type TierCheck = {
  readonly tiers: readonly BulkTier[];
  readonly floorMinor: bigint | null;
  readonly floorKnown: boolean;
  readonly note: string;
};

export type OrderTotals = {
  readonly unitRetailMinor: bigint;
  readonly quotedRetailMinor: bigint;
  readonly quotedWholesaleMinor: bigint;
  readonly savingsMinor: bigint;
  readonly tierApplied: boolean;
};

export function storeScopeKey(tenantId: string | null): string {
  return tenantId ?? OWNER_STORE_KEY;
}

function fail(message: string): never {
  throw new ValidationError('INVALID_BULK_TIERS', message);
}

/**
 * Accepts 0–2 decimal places. 10% is 1000 hundredths, 33.33% is 3333.
 * Extra decimals are rejected so the helper never uses a float.
 */
export function percentToHundredths(percent: string): bigint {
  const trimmed = percent.trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(trimmed)) {
    fail('Enter a percent from 0 to 99.99 with at most 2 decimal places.');
  }
  const [whole = '0', fraction = ''] = trimmed.split('.');
  const hundredths = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (hundredths <= 0n || hundredths >= 10000n) {
    fail('Percent off must be greater than 0 and less than 100.');
  }
  return hundredths;
}

/**
 * Unit price after a percent discount, rounded down to the minor unit.
 */
export function unitPriceFromPercentOff(baseUnit: bigint, percentHundredths: bigint): bigint {
  if (baseUnit <= 0n) {
    fail('Set a regular price before using percent off.');
  }
  if (percentHundredths <= 0n || percentHundredths >= 10000n) {
    fail('Percent off must be greater than 0 and less than 100.');
  }
  const price = (baseUnit * (10000n - percentHundredths)) / 10000n;
  return price > 0n ? price : 1n;
}

export function validateTiers(baseUnit: bigint, floorMinor: bigint | null, tiers: readonly BulkTier[]): TierCheck {
  if (baseUnit <= 0n) {
    fail('The regular unit price must be above zero before adding tiers.');
  }
  if (tiers.length > MAX_BULK_TIERS) {
    fail('Add at most 5 tiers.');
  }
  const sorted = [...tiers].sort((left, right) => left.minQty - right.minQty);
  let previousQty = 1;
  let previousPrice = baseUnit;
  for (const tier of sorted) {
    if (!Number.isInteger(tier.minQty) || tier.minQty < 2) {
      fail('Minimum quantity must be a whole number of at least 2.');
    }
    if (tier.minQty <= previousQty) {
      fail('Each tier needs a higher minimum quantity than the one above it.');
    }
    if (tier.unitPriceMinor <= 0n) {
      fail(
        floorMinor === null
          ? 'Enter a price above zero. Cost is unknown, so that is the only check.'
          : 'Enter a unit price above zero.',
      );
    }
    if (tier.unitPriceMinor >= baseUnit) {
      fail(`Each tier must be below the regular price of ${formatUsdt(baseUnit)}.`);
    }
    if (tier.unitPriceMinor >= previousPrice) {
      fail('Each tier must cost less per item than the tier above it.');
    }
    if (floorMinor !== null && tier.unitPriceMinor < floorMinor) {
      fail(`A tier cannot be below the cost floor of ${formatUsdt(floorMinor)}.`);
    }
    previousQty = tier.minQty;
    previousPrice = tier.unitPriceMinor;
  }
  const floorKnown = floorMinor !== null && floorMinor > 0n;
  return {
    tiers: sorted,
    floorMinor: floorKnown ? floorMinor : null,
    floorKnown,
    note: floorKnown
      ? `Prices must stay at or above ${formatUsdt(floorMinor ?? 0n)} and below ${formatUsdt(baseUnit)}.`
      : 'Cost is unknown, so the only check is that each tier price is above zero and below the regular price.',
  };
}

function tierAllowed(baseUnit: bigint, floorMinor: bigint | null, tier: BulkTier): boolean {
  if (!Number.isInteger(tier.minQty) || tier.minQty < 2) {
    return false;
  }
  if (tier.unitPriceMinor <= 0n || tier.unitPriceMinor >= baseUnit) {
    return false;
  }
  if (floorMinor !== null && floorMinor > 0n && tier.unitPriceMinor < floorMinor) {
    return false;
  }
  return true;
}

/**
 * Highest valid tier with min_qty <= quantity, otherwise the base unit.
 */
export function unitPriceForQuantity(
  baseUnit: bigint,
  tiers: readonly BulkTier[],
  quantity: number,
  floorMinor: bigint | null = null,
): bigint {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return baseUnit;
  }
  let chosen = baseUnit;
  let bestQty = 1;
  for (const tier of tiers) {
    if (!tierAllowed(baseUnit, floorMinor, tier)) {
      continue;
    }
    if (tier.minQty <= quantity && tier.minQty >= bestQty) {
      bestQty = tier.minQty;
      chosen = tier.unitPriceMinor;
    }
  }
  return chosen;
}

export function orderTotals(input: {
  readonly baseUnit: bigint;
  readonly tiers: readonly BulkTier[];
  readonly quantity: number;
  readonly wholesaleUnit: bigint;
  readonly floorMinor?: bigint | null;
}): OrderTotals {
  const quantity = input.quantity;
  const unit = unitPriceForQuantity(input.baseUnit, input.tiers, quantity, input.floorMinor ?? null);
  const qty = BigInt(quantity);
  const quotedRetailMinor = unit * qty;
  const list = input.baseUnit * qty;
  const savingsMinor = list > quotedRetailMinor ? list - quotedRetailMinor : 0n;
  return {
    unitRetailMinor: unit,
    quotedRetailMinor,
    quotedWholesaleMinor: input.wholesaleUnit * qty,
    savingsMinor,
    tierApplied: unit < input.baseUnit,
  };
}

/**
 * Numbers shown for an existing order. The total is always the stored quote,
 * which is what wallet and every other payment path charges.
 */
export function chargedQuoteDisplay(input: {
  readonly baseUnit: bigint;
  readonly tiers: readonly BulkTier[];
  readonly quantity: number;
  readonly quotedRetailMinor: bigint;
  readonly floorMinor?: bigint | null;
}): OrderTotals {
  const totals = orderTotals({
    baseUnit: input.baseUnit,
    tiers: input.tiers,
    quantity: input.quantity,
    wholesaleUnit: 0n,
    floorMinor: input.floorMinor ?? null,
  });
  const qty = BigInt(input.quantity);
  const divides = input.quantity > 0 && input.quotedRetailMinor % qty === 0n;
  const unit = divides ? input.quotedRetailMinor / qty : totals.unitRetailMinor;
  const list = input.baseUnit * qty;
  const savings = list > input.quotedRetailMinor ? list - input.quotedRetailMinor : 0n;
  return {
    unitRetailMinor: unit,
    quotedRetailMinor: input.quotedRetailMinor,
    quotedWholesaleMinor: totals.quotedWholesaleMinor,
    savingsMinor: savings,
    tierApplied: unit < input.baseUnit && savings > 0n,
  };
}
