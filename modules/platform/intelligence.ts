/**
 * @file modules/platform/intelligence.ts
 *
 * Cleans, filters low-signal boilerplate noise, deduplicates, and paginates
 * platform intelligence memories so the Intelligence page stays crisp and fast.
 */

import { formatPlainDatesInText } from '@/lib/display-labels';
import { isNoiseMemoryText, stripMemoryMarkers, type PublicMemory } from '@/lib/hindsight';

export type MemoryCategory = 'all' | 'decision' | 'experience' | 'observation' | 'fact';

export type CleanMemoryResult = {
  readonly items: readonly PublicMemory[];
  readonly hiddenNoiseCount: number;
  readonly duplicateCount: number;
};

export type PaginatedMemories = {
  readonly items: readonly PublicMemory[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly typeCounts: Readonly<Record<MemoryCategory, number>>;
};

export type PlatformIntelligencePayload = {
  readonly memoryCount: number;
  readonly rawCount: number;
  readonly hiddenNoiseCount: number;
  readonly duplicateCount: number;
  readonly status: 'operational' | 'degraded';
  readonly degraded: boolean;
  readonly timedOut: boolean;
  /**
   * ready: memories loaded. loading: the bank is slow and nothing is cached
   * yet (not a failure). unavailable: Hindsight returned an error.
   * not_configured: HINDSIGHT_ENABLED / HINDSIGHT_API_KEY / HINDSIGHT_API_URL missing.
   */
  readonly bankState: MemoryBankState;
  readonly platformIntelligence: string | null;
  readonly recentEvents: readonly PublicMemory[];
  readonly evidence: readonly PublicMemory[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly typeCounts: Readonly<Record<MemoryCategory, number>>;
};

export type MemoryBankState = 'ready' | 'loading' | 'unavailable' | 'not_configured';

const EMPTY_TYPE_COUNTS: Readonly<Record<MemoryCategory, number>> = {
  all: 0,
  decision: 0,
  experience: 0,
  observation: 0,
  fact: 0,
};

/** Payload for a recall that produced nothing. A timeout is "loading", never "unavailable". */
export function payloadForFailure(kind: 'timeout' | 'error' | 'not_configured'): PlatformIntelligencePayload {
  const bankState: MemoryBankState =
    kind === 'timeout' ? 'loading' : kind === 'not_configured' ? 'not_configured' : 'unavailable';
  return {
    memoryCount: 0,
    rawCount: 0,
    hiddenNoiseCount: 0,
    duplicateCount: 0,
    status: kind === 'timeout' ? 'operational' : 'degraded',
    degraded: kind !== 'timeout',
    timedOut: kind === 'timeout',
    bankState,
    platformIntelligence: null,
    recentEvents: [],
    evidence: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
    typeCounts: EMPTY_TYPE_COUNTS,
  };
}

type CachedSnapshot = {
  readonly bankId: string;
  readonly fetchedAt: number;
  readonly raw: readonly PublicMemory[];
};

/** Fresh window. Older snapshots are still served when a refresh is slow or fails. */
const CACHE_TTL_MS = 5 * 60_000;
let snapshotCache: CachedSnapshot | null = null;

export function readFreshPlatformCache(bankId: string, now: number = Date.now()): readonly PublicMemory[] | null {
  if (!snapshotCache || snapshotCache.bankId !== bankId) return null;
  if (now - snapshotCache.fetchedAt >= CACHE_TTL_MS) return null;
  return snapshotCache.raw;
}

export function readStalePlatformCache(bankId: string): readonly PublicMemory[] | null {
  if (!snapshotCache || snapshotCache.bankId !== bankId) return null;
  return snapshotCache.raw;
}

export function writePlatformCache(bankId: string, raw: readonly PublicMemory[], now: number = Date.now()): void {
  snapshotCache = { bankId, fetchedAt: now, raw };
}

export function resetPlatformIntelligenceCache(): void {
  snapshotCache = null;
}

export { isNoiseMemoryText, stripMemoryMarkers };

export function isNoiseMemory(
  memory: Pick<PublicMemory, 'text'> & { readonly type?: string; readonly context?: string },
): boolean {
  return isNoiseMemoryText(memory.text);
}

export function normalizeMemoryKey(text: string): string {
  return stripMemoryMarkers(text)
    .replace(/^Decision\s+[0-9a-f-]{8,}:\s*/i, '')
    .replace(/\bWhen:\s*[^\n]+/gi, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}(?:T\S+)?\b/g, ' ')
    .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/gi, ' ')
    .toLowerCase()
    .replace(/[^\w\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function memoryCategory(type: string): Exclude<MemoryCategory, 'all'> {
  const lower = type.trim().toLowerCase();
  if (lower === 'memory_decision' || lower === 'decision') return 'decision';
  if (lower === 'experience' || lower === 'recommendation_outcome') return 'experience';
  if (lower === 'opinion') return 'observation';
  return 'fact';
}

export function parseMemoryCategory(value: string | null): MemoryCategory {
  if (value === 'decision' || value === 'experience' || value === 'observation' || value === 'fact') {
    return value;
  }
  return 'all';
}

function timestampMs(iso: string | null): number {
  if (!iso) return -1;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : -1;
}

export function cleanAndDedupeMemories(rows: readonly PublicMemory[]): CleanMemoryResult {
  const byKey = new Map<string, PublicMemory>();
  let hiddenNoiseCount = 0;
  let duplicateCount = 0;

  for (const row of rows) {
    const stripped = stripMemoryMarkers(row.text);
    if (isNoiseMemory({ text: stripped, type: row.type, context: row.context })) {
      hiddenNoiseCount += 1;
      continue;
    }
    const cleanText = formatPlainDatesInText(stripped).replace(/\s+/g, ' ').trim();
    if (!cleanText) {
      hiddenNoiseCount += 1;
      continue;
    }
    const cleanedRow: PublicMemory = {
      id: row.id,
      text: cleanText,
      type: row.type,
      context: formatPlainDatesInText(stripMemoryMarkers(row.context)).trim(),
      occurredAt: row.occurredAt,
      tags: row.tags,
    };
    const key = normalizeMemoryKey(stripped) || cleanText.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, cleanedRow);
      continue;
    }
    duplicateCount += 1;
    if (timestampMs(cleanedRow.occurredAt) > timestampMs(existing.occurredAt)) {
      byKey.set(key, cleanedRow);
    }
  }

  const items = [...byKey.values()].sort((a, b) => timestampMs(b.occurredAt) - timestampMs(a.occurredAt));
  return {
    items,
    hiddenNoiseCount,
    duplicateCount,
  };
}

export function paginateMemories(
  rows: readonly PublicMemory[],
  opts: {
    readonly page: number;
    readonly pageSize: number;
    readonly category?: MemoryCategory;
    readonly q?: string;
  },
): PaginatedMemories {
  const counts: Record<MemoryCategory, number> = {
    all: rows.length,
    decision: 0,
    experience: 0,
    observation: 0,
    fact: 0,
  };
  for (const row of rows) {
    const cat = memoryCategory(row.type);
    counts[cat] += 1;
  }

  const category = opts.category ?? 'all';
  const needle = (opts.q ?? '').trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (category !== 'all' && memoryCategory(row.type) !== category) {
      return false;
    }
    if (needle && !row.text.toLowerCase().includes(needle)) {
      return false;
    }
    return true;
  });

  const safeSize = Math.max(5, Math.min(50, Math.floor(opts.pageSize) || 10));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.max(1, Math.min(totalPages, Math.floor(opts.page) || 1));
  const start = (safePage - 1) * safeSize;

  return {
    items: filtered.slice(start, start + safeSize),
    pagination: {
      page: safePage,
      pageSize: safeSize,
      total,
      totalPages,
    },
    typeCounts: counts,
  };
}
