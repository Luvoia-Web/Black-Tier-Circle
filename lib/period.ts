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

export const DEFAULT_BUSINESS_TIMEZONE = 'Asia/Kolkata';

export type ChartRange = 'today' | '7d' | '30d' | '12m';

export type ZonedDateParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
};

export type RangeBucketSpec = {
  readonly key: string;
  readonly label: string;
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Validates an IANA timezone string, falling back to Asia/Kolkata when missing or invalid.
 */
export function resolveBusinessTimezone(tz: string | null | undefined): string {
  const candidate = typeof tz === 'string' ? tz.trim() : '';
  if (!candidate) return DEFAULT_BUSINESS_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

/**
 * Extracts local calendar/clock parts for an instant in the given IANA timezone.
 */
export function getZonedParts(date: Date, timeZone: string): ZonedDateParts {
  const tz = resolveBusinessTimezone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find((p) => p.type === type)?.value ?? '0';
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour') % 24,
    minute: pick('minute'),
    second: pick('second'),
  };
}

/**
 * Returns the UTC instant corresponding to YYYY-MM-DD 00:00:00 in the given IANA timezone.
 */
export function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const tz = resolveBusinessTimezone(timeZone);
  const targetLocalAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let guess = targetLocalAsUtc;
  for (let i = 0; i < 2; i += 1) {
    const p = getZonedParts(new Date(guess), tz);
    const shownAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
    const diff = shownAsUtc - targetLocalAsUtc;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/**
 * Computes the start instant (in the business timezone) and the full ordered list
 * of dense chart buckets spanning the entire range (with zero-value slots for empty days/months).
 */
export function buildZonedRange(
  range: ChartRange,
  now: Date,
  timeZone: string | null | undefined,
): { readonly timeZone: string; readonly start: Date; readonly buckets: readonly RangeBucketSpec[] } {
  const tz = resolveBusinessTimezone(timeZone);
  const today = getZonedParts(now, tz);
  const buckets: RangeBucketSpec[] = [];

  if (range === 'today') {
    const start = zonedMidnightUtc(today.year, today.month, today.day, tz);
    for (let hour = 0; hour < 24; hour += 3) {
      buckets.push({ key: String(hour), label: `${pad2(hour)}:00` });
    }
    return { timeZone: tz, start, buckets };
  }

  if (range === '7d' || range === '30d') {
    const totalDays = range === '7d' ? 7 : 30;
    const baseUtcDay = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const firstDay = new Date(baseUtcDay);
    firstDay.setUTCDate(firstDay.getUTCDate() - (totalDays - 1));
    const start = zonedMidnightUtc(
      firstDay.getUTCFullYear(),
      firstDay.getUTCMonth() + 1,
      firstDay.getUTCDate(),
      tz,
    );
    for (let i = 0; i < totalDays; i += 1) {
      const cursor = new Date(firstDay);
      cursor.setUTCDate(firstDay.getUTCDate() + i);
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth() + 1;
      const d = cursor.getUTCDate();
      buckets.push({
        key: `${y}-${pad2(m)}-${pad2(d)}`,
        label: `${SHORT_MONTHS[m - 1] ?? 'Jan'} ${d}`,
      });
    }
    return { timeZone: tz, start, buckets };
  }

  // 12m: 12 monthly buckets ending on the current local month
  const firstMonthCursor = new Date(Date.UTC(today.year, today.month - 1 - 11, 1));
  const start = zonedMidnightUtc(
    firstMonthCursor.getUTCFullYear(),
    firstMonthCursor.getUTCMonth() + 1,
    1,
    tz,
  );
  for (let i = 0; i < 12; i += 1) {
    const cursor = new Date(Date.UTC(firstMonthCursor.getUTCFullYear(), firstMonthCursor.getUTCMonth() + i, 1));
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    buckets.push({
      key: `${y}-${pad2(m)}`,
      label: `${SHORT_MONTHS[m - 1] ?? 'Jan'} ${String(y).slice(-2)}`,
    });
  }
  return { timeZone: tz, start, buckets };
}

/**
 * Maps an ISO timestamp to its bucket key in the given business timezone.
 */
export function zonedBucketKey(range: ChartRange, iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const p = getZonedParts(date, timeZone);
  if (range === 'today') {
    return String(Math.floor(p.hour / 3) * 3);
  }
  if (range === '12m') {
    return `${p.year}-${pad2(p.month)}`;
  }
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}
