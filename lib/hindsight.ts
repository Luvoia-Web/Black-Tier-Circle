/**
 * @file lib/hindsight.ts
 *
 * Channel-independent MemoryOS service. Commerce memory is stored in
 * Hindsight banks. Missing configuration fails open and never throws.
 *
 * Bank ids are the isolation boundary. Callers must pass trusted tenant
 * and customer ids that have already been authorized.
 *
 * @module Hindsight
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { HindsightClient, HindsightError } from '@vectorize-io/hindsight-client';

import { logger } from './logger';

const DEFAULT_BANK_PREFIX = 'btc-prod';
const DECISION_MARKER = 'MEMORY_DECISION_V1 ';
const OUTCOME_MARKER = 'MEMORY_OUTCOME_V1 ';

const DECISION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['action', 'reason'],
};

export type MemoryEvidence = {
  id: string;
  text: string;
  type: string;
  context: string;
  documentId: string;
  occurredAt: string | null;
  tags: string[];
};

export type PublicMemory = {
  id: string;
  text: string;
  type: string;
  context: string;
  occurredAt: string | null;
  tags: string[];
};

export type MemoryDecision = {
  decisionId: string;
  action: string;
  reason: string;
  memories: MemoryEvidence[];
  currentState: string[];
};

export type DecisionEvidence = {
  action: string;
  reason: string;
  memories: MemoryEvidence[];
  currentState: string[];
  outcome: string | null;
};

type StoredDecision = {
  action: string;
  reason: string;
  memories: MemoryEvidence[];
  currentState: string[];
  outcome: string | null;
};

let sharedClient: HindsightClient | null = null;
const ensuredBanks = new Set<string>();
const memoryStatus = new AsyncLocalStorage<{ failed: boolean }>();

type RetainMetadata = Readonly<Record<string, string | number | boolean | null>>;

function markMemoryDegraded(): void {
  const status = memoryStatus.getStore();
  if (status) {
    status.failed = true;
  }
}

/**
 * Runs MemoryOS calls for an API request. A Hindsight failure sets degraded
 * and does not throw, so commerce and the route can both fail open.
 */
export async function runMemoryObservation<T>(
  work: () => Promise<T>,
): Promise<{ result: T; degraded: false } | { result: null; degraded: true }> {
  const status = { failed: false };
  try {
    const result = await memoryStatus.run(status, work);
    if (status.failed) {
      return { result: null, degraded: true };
    }
    return { result, degraded: false };
  } catch (error) {
    logFailure('observation', error);
    return { result: null, degraded: true };
  }
}

export function toPublicMemory(memory: MemoryEvidence): PublicMemory {
  return {
    id: memory.id,
    text: memory.text,
    type: memory.type,
    context: memory.context,
    occurredAt: memory.occurredAt,
    tags: memory.tags,
  };
}

function bankPrefix(): string {
  const configured = process.env.HINDSIGHT_BANK_PREFIX?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }
  return DEFAULT_BANK_PREFIX;
}

function getClient(): HindsightClient | null {
  if (process.env.HINDSIGHT_ENABLED !== 'true') {
    return null;
  }
  const apiKey = process.env.HINDSIGHT_API_KEY;
  const baseUrl = process.env.HINDSIGHT_API_URL || process.env.HINDSIGHT_BASE_URL;
  if (!apiKey || !baseUrl) {
    return null;
  }
  if (sharedClient === null) {
    sharedClient = new HindsightClient({
      apiKey,
      baseUrl,
      userAgent: 'black-tier-circle/memoryos',
    });
  }
  return sharedClient;
}

function logFailure(operation: string, error: unknown): void {
  const statusCode = error instanceof HindsightError ? (error.statusCode ?? null) : null;
  const message = error instanceof Error ? error.message.slice(0, 300) : 'unknown error';
  logger.warn(`hindsight ${operation} failed`, { statusCode, message });
}

function emptyDecision(currentState: readonly string[]): MemoryDecision {
  return {
    decisionId: '',
    action: '',
    reason: '',
    memories: [],
    currentState: [...currentState],
  };
}

function emptyEvidence(): DecisionEvidence {
  return {
    action: '',
    reason: '',
    memories: [],
    currentState: [],
    outcome: null,
  };
}

function coerceEvidence(value: unknown): MemoryEvidence | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.text !== 'string' ||
    typeof record.type !== 'string' ||
    typeof record.context !== 'string' ||
    typeof record.documentId !== 'string'
  ) {
    return null;
  }
  const tags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  return {
    id: record.id,
    text: record.text,
    type: record.type,
    context: record.context,
    documentId: record.documentId,
    occurredAt: typeof record.occurredAt === 'string' ? record.occurredAt : null,
    tags,
  };
}

function toEvidence(result: {
  id: string;
  text: string;
  type?: string | null;
  context?: string | null;
  document_id?: string | null;
  occurred_start?: string | null;
  mentioned_at?: string | null;
  tags?: Array<string> | null;
  metadata?: { [key: string]: string } | null;
}): MemoryEvidence {
  return {
    id: result.id,
    text: result.text,
    type: result.metadata?.type ?? result.type ?? '',
    context: result.context ?? '',
    documentId: result.document_id ?? '',
    occurredAt: result.occurred_start ?? result.mentioned_at ?? null,
    tags: result.tags ? [...result.tags] : [],
  };
}

function factsToEvidence(
  facts:
    | ReadonlyArray<{
        id?: string | null;
        text: string;
        type?: string | null;
        context?: string | null;
        occurred_start?: string | null;
      }>
    | undefined,
): MemoryEvidence[] {
  if (facts === undefined) {
    return [];
  }
  return facts.map((fact, index) => ({
    id: fact.id ?? `fact-${index}`,
    text: fact.text,
    type: fact.type ?? '',
    context: fact.context ?? '',
    documentId: '',
    occurredAt: fact.occurred_start ?? null,
    tags: [],
  }));
}

function readDecisionFields(value: unknown): { action: string; reason: string } {
  if (value === null || typeof value !== 'object') {
    return { action: '', reason: '' };
  }
  const record = value as Record<string, unknown>;
  return {
    action: typeof record.action === 'string' ? record.action : '',
    reason: typeof record.reason === 'string' ? record.reason : '',
  };
}

function parseMarkedJson(text: string | null, marker: string): unknown {
  if (text === null) {
    return null;
  }
  const index = text.lastIndexOf(marker);
  if (index === -1) {
    return null;
  }
  try {
    return JSON.parse(text.slice(index + marker.length).trim()) as unknown;
  } catch {
    return null;
  }
}

function parseDecisionBody(value: unknown): StoredDecision | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const memories = Array.isArray(record.memories)
    ? record.memories.flatMap((item) => {
        const evidence = coerceEvidence(item);
        return evidence === null ? [] : [evidence];
      })
    : [];
  const currentState = Array.isArray(record.currentState)
    ? record.currentState.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    action: typeof record.action === 'string' ? record.action : '',
    reason: typeof record.reason === 'string' ? record.reason : '',
    memories,
    currentState,
    outcome: typeof record.outcome === 'string' ? record.outcome : null,
  };
}

function parseOutcomeBody(value: unknown): string | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  return typeof record.outcome === 'string' ? record.outcome : null;
}

function outcomeDocumentId(decisionId: string): string {
  return `outcome:${decisionId}`;
}

function serializeDecision(decision: MemoryDecision): string {
  const record: StoredDecision = {
    action: decision.action,
    reason: decision.reason,
    memories: decision.memories,
    currentState: decision.currentState,
    outcome: null,
  };
  return `Decision ${decision.decisionId}: ${decision.action}. ${decision.reason}\n${DECISION_MARKER}${JSON.stringify(record)}`;
}

function outcomeText(decisionId: string, outcome: string, sanitizedPattern: string): string {
  const lead = sanitizedPattern.trim().length > 0 ? sanitizedPattern.trim() : 'Recommendation outcome';
  const record = JSON.stringify({ decisionId, outcome });
  return `${lead}\nOutcome ${outcome} for decision ${decisionId}.\n${OUTCOME_MARKER}${record}`;
}

async function ensureBank(client: HindsightClient, bankId: string): Promise<void> {
  if (ensuredBanks.has(bankId)) {
    return;
  }
  try {
    await client.createBank(bankId);
    ensuredBanks.add(bankId);
  } catch (error) {
    logFailure('createBank', error);
  }
}

async function readDocument(
  client: HindsightClient,
  bankId: string,
  documentId: string,
): Promise<{ original_text: string | null } | null> {
  try {
    return await client.getDocument(bankId, documentId);
  } catch (error) {
    if (error instanceof HindsightError && (error.statusCode === 404 || error.statusCode === 400)) {
      return null;
    }
    throw error;
  }
}

export type RecallOptions = {
  readonly budget?: 'low' | 'mid' | 'high';
  readonly timeoutMs?: number;
};

const TIMEOUT_SENTINEL = Symbol('hindsight-recall-timeout');

const NOISE_MEMORY_PATTERN =
  /\bplatform\s+lacks?\b.*\b(?:infrastructure|foundational\s+capabilities|operational\s+patterns|reporting\s+structures)\b|\b(?:lack|lacks?|lacking|insufficient)\s+(?:of\s+)?(?:the\s+|sufficient\s+|necessary\s+|foundational\s+|defined\s+)?(?:infrastructure|capabilities|operational\s+patterns|reporting\s+structures)\b|\bno\s+infrastructure\s+(?:to|for|exists)\b|\bplatform\s+(?:has\s+limited\s+capabilities|cannot\s+monitor\s+operational\s+patterns)\b/i;

const MEMORY_MARKER_PATTERN = /\n?(?:MEMORY_DECISION_V1|MEMORY_OUTCOME_V1)\s+[\s\S]*$/;

export function stripMemoryMarkers(raw: string): string {
  return raw.replace(MEMORY_MARKER_PATTERN, '').trim();
}

export function isNoiseMemoryText(raw: string): boolean {
  const cleaned = stripMemoryMarkers(raw);
  if (!cleaned) {
    return true;
  }
  return NOISE_MEMORY_PATTERN.test(cleaned);
}

async function recallExperience(
  bankId: string,
  query: string,
  options?: RecallOptions,
): Promise<MemoryEvidence[]> {
  const client = getClient();
  if (client === null || bankId.trim().length === 0 || query.trim().length === 0) {
    if (client === null) {
      markMemoryDegraded();
    }
    return [];
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = client.recall(bankId, query, { budget: options?.budget ?? 'mid' });
    const timeoutMs = options?.timeoutMs ?? 0;
    const outcome = timeoutMs > 0
      ? await Promise.race([
          work,
          new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
            timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutMs);
          }),
        ])
      : await work;
    if (outcome === TIMEOUT_SENTINEL) {
      void work.catch(() => undefined);
      logFailure('recall', new Error(`recall timed out after ${timeoutMs}ms`));
      markMemoryDegraded();
      return [];
    }
    return outcome.results.map(toEvidence);
  } catch (error) {
    if (error instanceof HindsightError && error.statusCode === 404) {
      return [];
    }
    logFailure('recall', error);
    markMemoryDegraded();
    return [];
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export type RecallOutcome =
  | { readonly kind: 'ok'; readonly rows: readonly MemoryEvidence[] }
  | { readonly kind: 'timeout'; readonly timeoutMs: number }
  | { readonly kind: 'not_configured' }
  | { readonly kind: 'error'; readonly statusCode: number | null };

type RecallFn = (
  bankId: string,
  query: string,
  opts: { budget: 'low' | 'mid' | 'high' },
) => Promise<{ results: readonly Parameters<typeof toEvidence>[0][] }>;

/**
 * Recall that tells a slow bank apart from a broken one. A timeout is not a
 * failure: the caller keeps the skeleton or the cached snapshot and says the
 * bank is still loading. Only a thrown error (or missing config) is reported
 * as unavailable.
 */
export async function recallWithOutcome(
  bankId: string,
  query: string,
  options: RecallOptions & { readonly recall?: RecallFn } = {},
): Promise<RecallOutcome> {
  let recall: RecallFn | null = options.recall ?? null;
  if (recall === null) {
    const client = getClient();
    if (client === null) {
      return { kind: 'not_configured' };
    }
    recall = (b, q, o) => client.recall(b, q, o) as ReturnType<RecallFn>;
  }
  if (bankId.trim().length === 0 || query.trim().length === 0) {
    return { kind: 'ok', rows: [] };
  }
  const timeoutMs = options.timeoutMs ?? 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = recall(bankId, query, { budget: options.budget ?? 'mid' });
    const outcome = timeoutMs > 0
      ? await Promise.race([
          work,
          new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
            timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutMs);
          }),
        ])
      : await work;
    if (outcome === TIMEOUT_SENTINEL) {
      void work.catch(() => undefined);
      logFailure('recall', new Error(`recall timed out after ${timeoutMs}ms`));
      return { kind: 'timeout', timeoutMs };
    }
    return { kind: 'ok', rows: outcome.results.map(toEvidence) };
  } catch (error) {
    if (error instanceof HindsightError && error.statusCode === 404) {
      return { kind: 'ok', rows: [] };
    }
    logFailure('recall', error);
    return {
      kind: 'error',
      statusCode: error instanceof HindsightError ? (error.statusCode ?? null) : null,
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function reflectIntelligence(
  bankId: string,
  subjectLabel: string,
  subjectId: string,
  currentState: readonly string[],
  queryOverride?: string,
): Promise<MemoryDecision> {
  const client = getClient();
  if (client === null || bankId.trim().length === 0) {
    if (client === null) {
      markMemoryDegraded();
    }
    return emptyDecision(currentState);
  }
  const stateLines = currentState.length > 0 ? currentState.map((line) => `- ${line}`).join('\n') : '- none';
  const query =
    queryOverride ??
    [
      `Decide the next action for ${subjectLabel} ${subjectId}.`,
      'Use only memories in this bank.',
      'Current state:',
      stateLines,
    ].join('\n');
  try {
    const response = await client.reflect(bankId, query, {
      budget: 'mid',
      context: queryOverride ?? currentState.join('\n'),
      includeFacts: true,
      responseSchema: DECISION_RESPONSE_SCHEMA,
    });
    const parsed = readDecisionFields(response.structured_output);
    const decision: MemoryDecision = {
      decisionId: randomUUID(),
      action: parsed.action,
      reason: response.text.trim().length > 0 ? response.text : parsed.reason,
      memories: factsToEvidence(response.based_on?.memories),
      currentState: [...currentState],
    };
    if (decision.reason.trim().length > 0 && !isNoiseMemoryText(decision.reason)) {
      await retainCommerceExperience(
        bankId,
        decision.decisionId,
        serializeDecision(decision),
        'memory_decision',
        `${subjectLabel} decision`,
      );
    }
    return decision;
  } catch (error) {
    if (error instanceof HindsightError && error.statusCode === 404) {
      return emptyDecision(currentState);
    }
    logFailure('reflect', error);
    markMemoryDegraded();
    return emptyDecision(currentState);
  }
}

export function resolvePlatformMemoryBank(): string {
  return `${bankPrefix()}:platform`;
}

export function resolveTenantMemoryBank(trustedTenantId: string): string {
  return `${bankPrefix()}:tenant:${trustedTenantId}`;
}

export function resolveCustomerMemoryBank(trustedTenantId: string, trustedCustomerId: string): string {
  return `${bankPrefix()}:tenant:${trustedTenantId}:customer:${trustedCustomerId}`;
}

function retainParts(
  typeOrTags: string | readonly string[],
  contextOrMetadata: string | RetainMetadata,
): { tags: string[]; context: string; metadata: Record<string, string> } {
  if (typeof typeOrTags === 'string') {
    return {
      tags: [typeOrTags],
      context: typeof contextOrMetadata === 'string' ? contextOrMetadata : typeOrTags,
      metadata: { type: typeOrTags },
    };
  }
  const tags = [...typeOrTags];
  const type = tags[0] ?? 'experience';
  const metadata: Record<string, string> = { type };
  if (typeof contextOrMetadata !== 'string') {
    for (const [key, value] of Object.entries(contextOrMetadata)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        metadata[key] = String(value);
      }
    }
  }
  return {
    tags,
    context: typeof contextOrMetadata === 'string' ? contextOrMetadata : type,
    metadata,
  };
}

export async function retainCommerceExperience(
  bankId: string,
  documentId: string,
  text: string,
  typeOrTags: string | readonly string[],
  contextOrMetadata: string | RetainMetadata,
): Promise<boolean> {
  const client = getClient();
  if (client === null || bankId.trim().length === 0 || text.trim().length === 0) {
    return false;
  }
  const parts = retainParts(typeOrTags, contextOrMetadata);
  try {
    await ensureBank(client, bankId);
    const response = await client.retain(bankId, text, {
      context: parts.context,
      documentId,
      metadata: parts.metadata,
      tags: parts.tags,
    });
    return response.success;
  } catch (error) {
    logFailure('retain', error);
    return false;
  }
}

export async function recallCustomerExperience(
  bankId: string,
  query: string,
  options?: RecallOptions,
): Promise<MemoryEvidence[]> {
  return recallExperience(bankId, query, options);
}

export async function recallTenantExperience(
  bankId: string,
  query: string,
  options?: RecallOptions,
): Promise<MemoryEvidence[]> {
  return recallExperience(bankId, query, options);
}

export async function reflectCustomerIntelligence(
  bankId: string,
  customerIdOrQuery: string,
  currentState?: readonly string[],
): Promise<MemoryDecision> {
  if (currentState === undefined) {
    return reflectIntelligence(bankId, 'customer', 'customer', [customerIdOrQuery], customerIdOrQuery);
  }
  return reflectIntelligence(bankId, 'customer', customerIdOrQuery, currentState);
}

export async function reflectStoreIntelligence(
  bankId: string,
  storeIdOrQuery: string,
  currentState?: readonly string[],
): Promise<MemoryDecision> {
  if (currentState === undefined) {
    return reflectIntelligence(bankId, 'store', 'store', [storeIdOrQuery], storeIdOrQuery);
  }
  return reflectIntelligence(bankId, 'store', storeIdOrQuery, currentState);
}

export async function recordRecommendationOutcome(
  customerBankId: string,
  tenantBankId: string,
  decisionId: string,
  outcome: string,
  sanitizedPattern: string,
): Promise<void> {
  if (getClient() === null || decisionId.trim().length === 0) {
    return;
  }
  const documentId = outcomeDocumentId(decisionId);
  const text = outcomeText(decisionId, outcome, sanitizedPattern);
  const context = sanitizedPattern.trim().length > 0 ? sanitizedPattern : 'recommendation outcome';
  await retainCommerceExperience(customerBankId, documentId, text, 'recommendation_outcome', context);
  await retainCommerceExperience(tenantBankId, documentId, text, 'recommendation_outcome', context);
}

export async function getDecisionEvidence(bankId: string, decisionId: string): Promise<DecisionEvidence> {
  const client = getClient();
  if (client === null || bankId.trim().length === 0 || decisionId.trim().length === 0) {
    return emptyEvidence();
  }
  try {
    const decisionDoc = await readDocument(client, bankId, decisionId);
    const outcomeDoc = await readDocument(client, bankId, outcomeDocumentId(decisionId));
    const decision = parseDecisionBody(parseMarkedJson(decisionDoc?.original_text ?? null, DECISION_MARKER));
    const recordedOutcome = parseOutcomeBody(parseMarkedJson(outcomeDoc?.original_text ?? null, OUTCOME_MARKER));
    if (decision === null && recordedOutcome === null) {
      return emptyEvidence();
    }
    return {
      action: decision?.action ?? '',
      reason: decision?.reason ?? '',
      memories: decision?.memories ?? [],
      currentState: decision?.currentState ?? [],
      outcome: recordedOutcome ?? decision?.outcome ?? null,
    };
  } catch (error) {
    logFailure('getDecisionEvidence', error);
    return emptyEvidence();
  }
}
