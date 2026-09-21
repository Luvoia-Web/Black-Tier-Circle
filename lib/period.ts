/**
 * @file lib/period.ts
 *
 * Dashboard period filters: Today | Yesterday | Week | Month | Lifetime.
 *
 * @module Period
 */

export const DASHBOARD_PERIODS = ['today', 'yesterday', 'week', 'month', 'lifetime'] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export type PeriodRange = {
  readonly from: Date | null;
  readonly to: Date | null;
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/**
 * Parses a period query string.
 */
export function parseDashboardPeriod(value: string | null | undefined): DashboardPeriod {
  if (value === 'yesterday' || value === 'week' || value === 'month' || value === 'lifetime') {
    return value;
  }
  return 'today';
}

/**
 * Returns inclusive from/to bounds for a dashboard period.
 * Lifetime has null bounds (no date filter).
 */
export function periodRange(period: DashboardPeriod, now: Date = new Date()): PeriodRange {
  if (period === 'lifetime') {
    return { from: null, to: null };
  }
  if (period === 'today') {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (period === 'yesterday') {
    const day = new Date(now);
    day.setDate(day.getDate() - 1);
    return { from: startOfDay(day), to: endOfDay(day) };
  }
  if (period === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  const from = new Date(now);
  from.setDate(from.getDate() - 29);
  return { from: startOfDay(from), to: endOfDay(now) };
}

/**
 * Returns true when `createdAt` falls inside the period range.
 */
export function inPeriod(createdAt: Date, range: PeriodRange): boolean {
  if (range.from !== null && createdAt < range.from) {
    return false;
  }
  if (range.to !== null && createdAt > range.to) {
    return false;
  }
  return true;
}
