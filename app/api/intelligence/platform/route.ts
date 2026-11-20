/**
 * @file app/api/intelligence/platform/route.ts
 *
 * Owner-only platform memory. Reflects and recalls the platform bank with
 * a 5 minute cache, low-signal noise filtering, deduplication, and an 8 s first-load timeout.
 * A slow bank is reported as loading; only a real error is reported as unavailable.
 * Customer banks are never read here.
 *
 * @module Api
 */

import { ZodError, z } from 'zod';

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { formatPlainDatesInText } from '@/lib/display-labels';
import { AppError } from '@/lib/errors';
import {
  isNoiseMemoryText,
  recallTenantExperience,
  recallWithOutcome,
  reflectStoreIntelligence,
  resolvePlatformMemoryBank,
  runMemoryObservation,
  toPublicMemory,
  type PublicMemory,
} from '@/lib/hindsight';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limiter';
import {
  cleanAndDedupeMemories,
  paginateMemories,
  parseMemoryCategory,
  payloadForFailure,
  readFreshPlatformCache,
  readStalePlatformCache,
  writePlatformCache,
  type MemoryCategory,
  type PlatformIntelligencePayload,
} from '@/modules/platform/intelligence';

export const dynamic = 'force-dynamic';

/** First load waits up to 8 s (the bank is slow on a cold start); later loads use the cache. */
const GET_TIMEOUT_MS = 8000;
const POST_TIMEOUT_MS = 8000;

const PlatformQuerySchema = z.object({
  query: z.string().trim().min(1).max(2000).optional(),
});

const DEFAULT_QUERY = 'What operational patterns should the platform watch across stores?';

function buildPayloadFromRaw(
  raw: readonly PublicMemory[],
  opts: {
    readonly page: number;
    readonly pageSize: number;
    readonly category: MemoryCategory;
    readonly q: string;
    readonly platformIntelligence: string | null;
    readonly evidence: readonly PublicMemory[];
    readonly timedOut?: boolean;
  },
): PlatformIntelligencePayload {
  const cleaned = cleanAndDedupeMemories(raw);
  const paged = paginateMemories(cleaned.items, {
    page: opts.page,
    pageSize: opts.pageSize,
    category: opts.category,
    q: opts.q,
  });
  const cleanedEvidence = cleanAndDedupeMemories(opts.evidence).items;
  return {
    memoryCount: cleaned.items.length,
    rawCount: raw.length,
    hiddenNoiseCount: cleaned.hiddenNoiseCount,
    duplicateCount: cleaned.duplicateCount,
    status: 'operational',
    degraded: false,
    timedOut: opts.timedOut === true,
    bankState: 'ready',
    platformIntelligence: opts.platformIntelligence,
    recentEvents: paged.items,
    evidence: cleanedEvidence,
    pagination: paged.pagination,
    typeCounts: paged.typeCounts,
  };
}

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const rate = await consumeRateLimit({
      key: `intelligence:ask:${session.user.id}`,
      limit: 20,
      windowMs: 60_000,
      fail: 'closed',
    });
    if (!rate.allowed) {
      throw new AppError('RATE_LIMITED', 'Too many questions asked. Please wait a minute.', 429);
    }
    const parsed = PlatformQuerySchema.parse(await readJsonBody(request));
    const query = parsed.query?.trim() || DEFAULT_QUERY;
    const bankId = resolvePlatformMemoryBank();
    const observed = await runMemoryObservation(async () => {
      const decision = await reflectStoreIntelligence(bankId, query);
      const recent = await recallTenantExperience(bankId, 'recent platform events', {
        budget: 'low',
        timeoutMs: POST_TIMEOUT_MS,
      });
      return { decision, recent };
    });

    await asDbClient(session.admin).from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: null,
      action: 'intelligence.ask',
      target_type: 'intelligence',
      target_id: null,
      reason: query.slice(0, 200),
      after_val: {
        queryLength: query.length,
        degraded: observed.degraded || observed.result === null,
      },
    });

    if (observed.degraded || observed.result === null) {
      return jsonSuccess(payloadForFailure('timeout'), 200, { cache: 'none' });
    }

    const rawRecent = observed.result.recent.map(toPublicMemory);
    writePlatformCache(bankId, rawRecent);

    const rawReason = observed.result.decision.reason.trim();
    const platformIntelligence = rawReason.length === 0
      ? null
      : isNoiseMemoryText(rawReason)
        ? 'Not enough recorded store patterns in memory yet to answer that specifically.'
        : formatPlainDatesInText(rawReason);

    return jsonSuccess(
      buildPayloadFromRaw(rawRecent, {
        page: 1,
        pageSize: 10,
        category: 'all',
        q: '',
        platformIntelligence,
        evidence: observed.result.decision.memories.map(toPublicMemory),
      }),
      200,
      { cache: 'none' },
    );
  } catch (error: unknown) {
    if (error instanceof AppError || error instanceof ZodError) {
      return handleRouteError(error);
    }
    return jsonSuccess(payloadForFailure('error'), 200, { cache: 'none' });
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireOwner();
    const params = new URL(request.url).searchParams;
    const page = parseIntParam(params.get('page'), 1, 1, 500);
    const pageSize = parseIntParam(params.get('pageSize'), 10, 5, 50);
    const category = parseMemoryCategory(params.get('category'));
    const q = (params.get('q') ?? '').trim().slice(0, 120);
    const refresh = params.get('refresh') === '1';

    const bankId = resolvePlatformMemoryBank();
    const view = { page, pageSize, category, q, platformIntelligence: null, evidence: [] as const };
    if (!refresh) {
      const fresh = readFreshPlatformCache(bankId);
      if (fresh) {
        return jsonSuccess(buildPayloadFromRaw(fresh, view), 200, { cache: 'none' });
      }
    }

    const outcome = await recallWithOutcome(bankId, 'platform activity', {
      budget: 'mid',
      timeoutMs: GET_TIMEOUT_MS,
    });

    if (outcome.kind === 'ok') {
      const raw = outcome.rows.map(toPublicMemory);
      writePlatformCache(bankId, raw);
      return jsonSuccess(buildPayloadFromRaw(raw, view), 200, { cache: 'none' });
    }

    const stale = readStalePlatformCache(bankId);
    if (stale) {
      return jsonSuccess(
        buildPayloadFromRaw(stale, { ...view, timedOut: outcome.kind === 'timeout' }),
        200,
        { cache: 'none' },
      );
    }
    return jsonSuccess(payloadForFailure(outcome.kind), 200, { cache: 'none' });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return handleRouteError(error);
    }
    return jsonSuccess(payloadForFailure('error'), 200, { cache: 'none' });
  }
}
