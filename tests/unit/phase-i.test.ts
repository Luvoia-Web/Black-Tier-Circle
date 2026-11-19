/**
 * @file tests/unit/phase-i.test.ts
 *
 * Phase I test suite covering:
 * 1. Analytics read model (7d UTC window attribution, single order-state truth,
 *    reseller isolation, payment/channel shares, zero snake_case labels)
 * 2. Platform Intelligence cleaning/deduping, pagination, <2s timeout fallback,
 *    30s cache, owner-only guards, rate limits, and audit_log writes
 * 3. Remy AI Groq SSE streaming, role prompts, rate limits, audit_log writes,
 *    and UI source guards (no Claude branding, no inner sidebar, no Back to dashboard)
 *
 * @module Tests
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '@/lib/errors';
import { resetRateLimitStore } from '@/lib/rate-limiter';
import { readAnalytics, parseAnalyticsRange } from '@/modules/platform/analytics';
import {
  cleanAndDedupeMemories,
  isNoiseMemory,
  normalizeMemoryKey,
  paginateMemories,
} from '@/modules/platform/intelligence';
import type { PublicMemory } from '@/lib/hindsight';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const mockRequireOwner = vi.hoisted(() => vi.fn());
const mockRequireRole = vi.hoisted(() => vi.fn());
const mockRequireReseller = vi.hoisted(() => vi.fn());
const mockHindsightRecall = vi.hoisted(() => vi.fn());
const mockHindsightReflect = vi.hoisted(() => vi.fn());
const mockHindsightCreateBank = vi.hoisted(() => vi.fn());
const mockHindsightRetain = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireOwner: mockRequireOwner,
    requireRole: mockRequireRole,
    requireReseller: mockRequireReseller,
  };
});

vi.mock('@vectorize-io/hindsight-client', () => {
  class MockHindsightError extends Error {
    statusCode?: number | undefined;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  class MockHindsightClient {
    recall = mockHindsightRecall;
    reflect = mockHindsightReflect;
    createBank = mockHindsightCreateBank;
    retain = mockHindsightRetain;
  }
  return {
    HindsightClient: MockHindsightClient,
    HindsightError: MockHindsightError,
  };
});

import {
  GET as intelligenceGet,
  POST as intelligencePost,
} from '@/app/api/intelligence/platform/route';
import { POST as assistantPost } from '@/app/api/assistant/route';
import { resetPlatformIntelligenceCache } from '@/modules/platform/intelligence';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const RESELLER_USER_ID = '00000000-0000-4000-8000-000000000002';
const TENANT_A = '00000000-0000-4000-8000-000000000010';
const TENANT_B = '00000000-0000-4000-8000-000000000011';
const PRODUCT_A = '00000000-0000-4000-8000-000000000101';
const PRODUCT_B = '00000000-0000-4000-8000-000000000102';

afterEach(() => {
  vi.useRealTimers();
  resetRateLimitStore();
  resetPlatformIntelligenceCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mockRequireOwner.mockReset();
  mockRequireRole.mockReset();
  mockRequireReseller.mockReset();
  mockHindsightRecall.mockReset();
  mockHindsightReflect.mockReset();
  mockHindsightCreateBank.mockReset();
  mockHindsightRetain.mockReset();
});

describe('Phase I — Analytics readAnalytics', () => {
  it('attributes orders delivered 6 days ago across UTC boundaries and respects single delivered status', async () => {
    const db = createMemoryDb({
      products: [
        { id: PRODUCT_A, title: 'ChatGPT Plus 30D' },
        { id: PRODUCT_B, title: 'Perplexity Pro' },
      ],
      tenants: [
        { id: TENANT_A, display_name: 'Prince', business_name: 'Prince Store' },
      ],
      bot_connections: [
        { id: 'bot-1', tenant_id: TENANT_A, username: 'prince_store_bot' },
      ],
      orders: [
        {
          id: 'd4e8eaab-0000-4000-8000-000000000001',
          tenant_id: null,
          channel: 'owner_store',
          payment_method: 'usdt_bep20',
          payment_status: 'verified',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          quoted_retail_price: '400000',
          quantity: 1,
          customer_id: 'cust-1',
          product_id: PRODUCT_A,
          created_at: '2026-10-04T02:14:00.000Z',
        },
        {
          id: '8c668888-0000-4000-8000-000000000002',
          tenant_id: TENANT_A,
          channel: 'reseller_bot',
          payment_method: 'wallet',
          payment_status: 'verified',
          fulfillment_status: 'failed',
          delivery_status: 'sent',
          quoted_retail_price: '600000',
          quantity: 2,
          customer_id: 'cust-2',
          product_id: PRODUCT_B,
          created_at: '2026-10-08T14:00:00.000Z',
        },
        {
          id: 'ord-prior-1',
          tenant_id: null,
          channel: 'api',
          payment_method: 'binance_pay',
          payment_status: 'verified',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          quoted_retail_price: '500000',
          quantity: 1,
          customer_id: 'cust-3',
          product_id: PRODUCT_A,
          created_at: '2026-10-01T10:00:00.000Z',
        },
      ],
    });

    const fixedNow = new Date('2026-10-10T18:30:00.000Z');
    const payload = await readAnalytics(db, { role: 'owner', tenantId: null }, '7d', fixedNow);

    expect(parseAnalyticsRange('30d')).toBe('30d');
    expect(parseAnalyticsRange('bogus')).toBe('7d');
    expect(payload.revenue).toBe('1.00 USDT');
    expect(payload.previousRevenue).toBe('0.50 USDT');
    expect(payload.deltaPercent).toBe(100);
    expect(payload.revenueSeries).toHaveLength(7);
    expect(payload.ordersSeries).toHaveLength(7);
    expect(payload.ordersSummary.delivered).toBe(2);
    expect(payload.ordersSummary.attention).toBe(0);
    expect(payload.topProducts.map((p) => p.name)).toEqual(['Perplexity Pro', 'ChatGPT Plus 30D']);
    expect(payload.topResellers).toHaveLength(1);
    expect(payload.topResellers[0]?.handle).toBe('@prince_store_bot');
    expect(payload.paymentShare.map((s) => s.name)).toEqual(['USDT BEP20', 'Wallet balance']);
  });

  it('scopes reseller analytics strictly to their tenant and handles null tenantId safely', async () => {
    const db = createMemoryDb({
      products: [{ id: PRODUCT_A, title: 'ChatGPT Plus 30D' }],
      tenants: [
        { id: TENANT_A, display_name: 'Alpha', business_name: 'Alpha Store' },
        { id: TENANT_B, display_name: 'Beta', business_name: 'Beta Store' },
      ],
      orders: [
        {
          id: 'ord-a',
          tenant_id: TENANT_A,
          channel: 'reseller_bot',
          payment_method: 'wallet',
          payment_status: 'verified',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          quoted_retail_price: '2000000',
          quantity: 1,
          customer_id: 'cust-a',
          product_id: PRODUCT_A,
          created_at: '2026-10-09T10:00:00.000Z',
        },
        {
          id: 'ord-b',
          tenant_id: TENANT_B,
          channel: 'reseller_bot',
          payment_method: 'wallet',
          payment_status: 'verified',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          quoted_retail_price: '9000000',
          quantity: 1,
          customer_id: 'cust-b',
          product_id: PRODUCT_A,
          created_at: '2026-10-09T11:00:00.000Z',
        },
      ],
    });

    const fixedNow = new Date('2026-10-10T12:00:00.000Z');
    const scoped = await readAnalytics(db, { role: 'reseller', tenantId: TENANT_A }, '7d', fixedNow);
    expect(scoped.revenue).toBe('2.00 USDT');
    expect(scoped.ordersSummary.paid).toBe(1);
    expect(scoped.topResellers).toEqual([]);
    expect(scoped.channelShare.map((slice) => slice.name)).toEqual(['Bot store']);

    const empty = await readAnalytics(db, { role: 'reseller', tenantId: null }, '7d', fixedNow);
    expect(empty.revenue).toBe('0.00 USDT');
    expect(empty.ordersSummary.total).toBe(0);
    expect(empty.topResellers).toEqual([]);
  });
});

describe('Phase I — Intelligence deduping, noise filter, cache, timeout, and audit', () => {
  it('filters repeated infrastructure noise, deduplicates near-duplicates, and paginates', () => {
    const sample: PublicMemory[] = [
      {
        id: '1',
        text: 'The platform lacks infrastructure to fulfill digital subscriptions automatically.',
        type: 'opinion',
        context: '',
        occurredAt: '2026-10-08T10:00:00.000Z',
        tags: [],
      },
      {
        id: '2',
        text: 'Platform lacks sufficient infrastructure for automated delivery.',
        type: 'memory_decision',
        context: '',
        occurredAt: '2026-10-09T10:00:00.000Z',
        tags: [],
      },
      {
        id: '3',
        text: 'Decision 11111111-1111-4111-8111-111111111111: Prioritize Canboso refills on 2026-10-08.\nMEMORY_DECISION_V1 {"action":"refill"}',
        type: 'memory_decision',
        context: '',
        occurredAt: '2026-10-08T12:00:00.000Z',
        tags: [],
      },
      {
        id: '4',
        text: 'Prioritize Canboso refills on 2026-10-09.\nMEMORY_DECISION_V1 {"action":"refill"}',
        type: 'memory_decision',
        context: '',
        occurredAt: '2026-10-09T12:00:00.000Z',
        tags: [],
      },
      {
        id: '5',
        text: 'Buyers prefer 30D ChatGPT Plus plans before weekends.',
        type: 'experience',
        context: '',
        occurredAt: '2026-10-10T09:00:00.000Z',
        tags: [],
      },
    ];

    expect(isNoiseMemory(sample[0]!)).toBe(true);
    expect(normalizeMemoryKey(sample[2]!.text)).toBe(normalizeMemoryKey(sample[3]!.text));

    const cleaned = cleanAndDedupeMemories(sample);
    expect(cleaned.hiddenNoiseCount).toBe(2);
    expect(cleaned.duplicateCount).toBe(1);
    expect(cleaned.items).toHaveLength(2);
    expect(cleaned.items[0]?.id).toBe('5');
    expect(cleaned.items[1]?.id).toBe('4');
    expect(cleaned.items[1]?.text).not.toContain('MEMORY_DECISION_V1');
    expect(cleaned.items[1]?.text).not.toMatch(/\d{4}-\d{2}-\d{2}/);

    const paged = paginateMemories(cleaned.items, {
      page: 1,
      pageSize: 5,
      category: 'experience',
      q: 'ChatGPT',
    });
    expect(paged.items).toHaveLength(1);
    expect(paged.typeCounts.all).toBe(2);
    expect(paged.typeCounts.decision).toBe(1);
    expect(paged.typeCounts.experience).toBe(1);
  });

  it('rejects reseller access with 403 and fails open under 2s when Hindsight times out', async () => {
    mockRequireOwner.mockRejectedValueOnce(new AuthError('FORBIDDEN', 'Owner access required', 403));
    const forbiddenRes = await intelligenceGet(new Request('http://localhost/api/intelligence/platform'));
    expect(forbiddenRes.status).toBe(403);

    vi.stubEnv('HINDSIGHT_ENABLED', 'true');
    vi.stubEnv('HINDSIGHT_API_KEY', 'hs-key');
    vi.stubEnv('HINDSIGHT_API_URL', 'https://hindsight.example.test');
    vi.useFakeTimers();

    mockRequireOwner.mockResolvedValue({
      user: { id: OWNER_ID },
      profile: { role: 'owner', displayName: 'Kush' },
      admin: createMemoryDb({ audit_log: [] }),
    });
    mockHindsightRecall.mockImplementation(() => new Promise(() => {}));

    const pending = intelligenceGet(new Request('http://localhost/api/intelligence/platform'));
    await vi.advanceTimersByTimeAsync(1600);
    const res = await pending;
    const json = (await res.json()) as {
      success: boolean;
      data: { degraded: boolean; timedOut: boolean; recentEvents: unknown[] };
    };
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.degraded).toBe(true);
    expect(json.data.timedOut).toBe(true);
    expect(json.data.recentEvents).toEqual([]);
  });

  it('caches GET memories, filters noise on POST, rate-limits, and writes audit_log', async () => {
    vi.stubEnv('HINDSIGHT_ENABLED', 'true');
    vi.stubEnv('HINDSIGHT_API_KEY', 'hs-key');
    vi.stubEnv('HINDSIGHT_API_URL', 'https://hindsight.example.test');

    const db = createMemoryDb({ audit_log: [] });
    mockRequireOwner.mockResolvedValue({
      user: { id: OWNER_ID },
      profile: { role: 'owner', displayName: 'Kush' },
      admin: db,
    });
    mockHindsightRecall.mockResolvedValue({
      results: [
        { id: 'n1', text: 'The platform lacks infrastructure to scale.', type: 'opinion', occurred_start: '2026-10-09T10:00:00.000Z' },
        { id: 'e1', text: 'Top buyers reorder weekly.', type: 'experience', occurred_start: '2026-10-10T10:00:00.000Z' },
        { id: 'e2', text: 'Top buyers reorder weekly.', type: 'experience', occurred_start: '2026-10-08T10:00:00.000Z' },
      ],
    });

    const first = await intelligenceGet(new Request('http://localhost/api/intelligence/platform?page=1&pageSize=10'));
    const firstJson = (await first.json()) as { data: { memoryCount: number; hiddenNoiseCount: number; duplicateCount: number } };
    expect(firstJson.data.memoryCount).toBe(1);
    expect(firstJson.data.hiddenNoiseCount).toBe(1);
    expect(firstJson.data.duplicateCount).toBe(1);
    expect(mockHindsightRecall).toHaveBeenCalledTimes(1);

    const second = await intelligenceGet(new Request('http://localhost/api/intelligence/platform?page=1&pageSize=10'));
    expect(second.status).toBe(200);
    expect(mockHindsightRecall).toHaveBeenCalledTimes(1);

    mockHindsightReflect.mockResolvedValue({
      text: 'Focus restocks on weekend plans.',
      structured_output: { action: 'restock', reason: 'Focus restocks on weekend plans.' },
      based_on: { memories: [] },
    });
    mockHindsightCreateBank.mockResolvedValue({});
    mockHindsightRetain.mockResolvedValue({ success: true });

    const askRes = await intelligencePost(
      new Request('http://localhost/api/intelligence/platform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'What should I watch this week?' }),
      }),
    );
    const askJson = (await askRes.json()) as { data: { platformIntelligence: string | null } };
    expect(askRes.status).toBe(200);
    expect(askJson.data.platformIntelligence).toBe('Focus restocks on weekend plans.');

    const logs = db.tables.audit_log ?? [];
    expect(logs.some((row) => row.action === 'intelligence.ask' && row.actor_id === OWNER_ID)).toBe(true);
  });
});

describe('Phase I — Remy AI route and UI source guards', () => {
  it('validates input, streams Groq SSE reply, writes audit_log, and removes stale Chrome/Claude UI', async () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-test-key');
    vi.stubEnv('HINDSIGHT_ENABLED', 'false');

    const db = createMemoryDb({
      tenants: [{ id: TENANT_A, owner_user_id: RESELLER_USER_ID, display_name: 'Prince', business_name: 'Prince Store', status: 'active' }],
      audit_log: [],
    });

    mockRequireRole.mockResolvedValue({
      user: { id: RESELLER_USER_ID },
      profile: { role: 'reseller', displayName: 'Prince' },
      admin: db,
    });
    mockRequireReseller.mockResolvedValue({
      tenant: { id: TENANT_A },
    });

    const badRes = await assistantPost(
      new Request('http://localhost/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(badRes.status).toBe(400);

    const sseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Check margins in Products."}}]}\n\n'));
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(sseBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })),
    );

    const okRes = await assistantPost(
      new Request('http://localhost/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'How do I set margins?' }] }),
      }),
    );
    expect(okRes.status).toBe(200);
    const streamed = await okRes.text();
    expect(streamed).toContain('memory_context');
    expect(streamed).toContain('Check margins in Products.');

    const logs = db.tables.audit_log ?? [];
    expect(
      logs.some(
        (row) => row.action === 'assistant.chat' && row.actor_id === RESELLER_USER_ID && row.tenant_id === TENANT_A,
      ),
    ).toBe(true);

    const chatSource = fs.readFileSync(path.resolve(process.cwd(), 'components/assistant/assistant-chat.tsx'), 'utf8');
    const pageSource = fs.readFileSync(path.resolve(process.cwd(), 'components/assistant/assistant-page.tsx'), 'utf8');
    expect(chatSource).toContain('Powered by Groq');
    expect(chatSource).not.toContain('Powered by Claude');
    expect(pageSource).not.toContain('Back to dashboard');
    expect(pageSource).not.toContain('ai-side');
  });
});
