/**
 * @file modules/public-api/webhooks.ts
 *
 * Outbound webhook delivery to reseller endpoints.
 * When order events occur, we POST to registered webhook URLs.
 *
 * Delivery rules:
 * - POST JSON payload to reseller's webhook URL
 * - Include X-BTC-Signature header (HMAC-SHA256 of payload + webhook secret)
 * - Retry up to 3 times on failure (exponential backoff: 10s, 30s, 90s)
 * - Mark webhook as failed after 3 failures — don't retry indefinitely
 *
 * @module PublicApi
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { API_CONFIG } from '@/lib/api-config';
import { decrypt, encrypt } from '@/lib/encryption';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import type {
  CreateWebhookInput,
  WebhookCreationResult,
  WebhookEndpoint,
  WebhookEndpointRow,
  WebhookEvent,
} from './types';

export type { WebhookEvent } from './types';

const HTTPS_PREFIX = 'https://';

function asWebhookRow(data: unknown): WebhookEndpointRow {
  return data as WebhookEndpointRow;
}

function asWebhookEvent(value: string): WebhookEvent | null {
  const events: readonly string[] = API_CONFIG.webhooks.events;
  if (events.includes(value)) {
    return value as WebhookEvent;
  }
  return null;
}

function mapWebhookRow(row: WebhookEndpointRow): WebhookEndpoint {
  const events = (row.events ?? [])
    .map((event) => asWebhookEvent(event))
    .filter((event): event is WebhookEvent => event !== null);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    url: row.url,
    events,
    secretPrefix: row.secret_prefix,
    isActive: row.is_active === true,
    failureCount: row.failure_count,
    lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at) : null,
    createdAt: new Date(row.created_at),
  };
}

function hashSecret(rawSecret: string): string {
  return createHash('sha256').update(rawSecret, 'utf8').digest('hex');
}

function retryDelays(): readonly number[] {
  if (process.env.VITEST) {
    return [0, 0, 0];
  }
  return API_CONFIG.webhooks.retryBackoffMs;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Rejects non-HTTPS webhook URLs.
 */
export function assertHttpsWebhookUrl(url: string): void {
  if (!url.startsWith(HTTPS_PREFIX)) {
    throw new ValidationError('VALIDATION_ERROR', 'Webhook URL must use https://');
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw new ValidationError('VALIDATION_ERROR', 'Webhook URL must use https://');
    }
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('VALIDATION_ERROR', 'Webhook URL is invalid');
  }
}

/**
 * HMAC-SHA256 hex digest of a payload using the webhook secret.
 */
export function signWebhookPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Verifies an inbound webhook signature with a timing-safe comparison.
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = signWebhookPayload(payload, secret);
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(signature, 'hex');
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host;
    const path = parsed.pathname.length > 6 ? `${parsed.pathname.slice(0, 4)}…` : parsed.pathname;
    return `${parsed.protocol}//${host}${path}`;
  } catch {
    return 'https://…';
  }
}

/**
 * Registers a webhook endpoint. Raw signing secret is returned once.
 */
export async function registerWebhookEndpoint(
  supabase: DbClient,
  input: CreateWebhookInput,
): Promise<WebhookCreationResult> {
  assertHttpsWebhookUrl(input.url);
  if (input.events.length === 0) {
    throw new ValidationError('VALIDATION_ERROR', 'Select at least one webhook event');
  }
  const rawSecret = randomBytes(32).toString('hex');
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .insert({
      tenant_id: input.tenantId,
      url: input.url,
      events: input.events,
      secret: encrypt(rawSecret),
      secret_hash: hashSecret(rawSecret),
      secret_prefix: rawSecret.slice(0, 8),
      is_active: true,
      failure_count: 0,
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('WEBHOOK_CREATE_FAILED', error?.message ?? 'Unable to register webhook', 500);
  }
  return { webhook: mapWebhookRow(asWebhookRow(data)), rawSecret };
}

const PLATFORM_EVENTS = ['order.paid', 'order.delivered', 'reseller.activated'] as const;

/**
 * Registers a platform-wide webhook. The signing secret is returned once.
 */
export async function registerPlatformWebhook(
  supabase: DbClient,
  url: string,
  events: ReadonlyArray<string>,
): Promise<WebhookCreationResult> {
  assertHttpsWebhookUrl(url);
  const allowed = events.filter((event): event is WebhookEvent =>
    (PLATFORM_EVENTS as readonly string[]).includes(event),
  );
  if (allowed.length === 0) {
    throw new ValidationError('VALIDATION_ERROR', 'Select at least one webhook event');
  }
  const rawSecret = randomBytes(32).toString('hex');
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .insert({
      tenant_id: null,
      url,
      events: allowed,
      secret: encrypt(rawSecret),
      secret_hash: hashSecret(rawSecret),
      secret_prefix: rawSecret.slice(0, 8),
      is_active: true,
      failure_count: 0,
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('WEBHOOK_CREATE_FAILED', error?.message ?? 'Unable to register webhook', 500);
  }
  return { webhook: mapWebhookRow(asWebhookRow(data)), rawSecret };
}

/**
 * Lists platform webhooks (rows with no tenant).
 */
export async function listPlatformWebhooks(supabase: DbClient): Promise<WebhookEndpoint[]> {
  const result = (await supabase
    .from('webhook_endpoints')
    .select('*')
    .is('tenant_id', null)
    .order('created_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('WEBHOOK_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.filter((row) => asWebhookRow(row).tenant_id == null).map((row) => mapWebhookRow(asWebhookRow(row)));
}

/**
 * Deletes a platform webhook.
 */
export async function deletePlatformWebhook(supabase: DbClient, webhookId: string): Promise<void> {
  const { data, error } = await supabase.from('webhook_endpoints').select('*').eq('id', webhookId).maybeSingle();
  if (error) {
    throw new AppError('WEBHOOK_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null || asWebhookRow(data).tenant_id != null) {
    throw new AppError('NOT_FOUND', 'Webhook not found', 404);
  }
  const { error: deleteError } = await supabase.from('webhook_endpoints').delete().eq('id', webhookId);
  if (deleteError) {
    throw new AppError('WEBHOOK_DELETE_FAILED', deleteError.message, 500);
  }
}

/**
 * Lists webhook endpoints for a tenant. Secrets are never returned.
 */
export async function listWebhookEndpoints(
  supabase: DbClient,
  tenantId: string,
): Promise<WebhookEndpoint[]> {
  const result = (await supabase
    .from('webhook_endpoints')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('WEBHOOK_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapWebhookRow(asWebhookRow(row)));
}

/**
 * Deletes a webhook endpoint owned by the tenant.
 */
export async function deleteWebhookEndpoint(
  supabase: DbClient,
  webhookId: string,
  tenantId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .select('*')
    .eq('id', webhookId)
    .maybeSingle();
  if (error) {
    throw new AppError('WEBHOOK_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null || asWebhookRow(data).tenant_id !== tenantId) {
    throw new AppError('NOT_FOUND', 'Webhook not found', 404);
  }
  const { error: deleteError } = await supabase.from('webhook_endpoints').delete().eq('id', webhookId);
  if (deleteError) {
    throw new AppError('WEBHOOK_DELETE_FAILED', deleteError.message, 500);
  }
}

/**
 * Toggles a webhook endpoint active flag.
 */
export async function setWebhookActive(
  supabase: DbClient,
  webhookId: string,
  tenantId: string,
  isActive: boolean,
): Promise<WebhookEndpoint> {
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .select('*')
    .eq('id', webhookId)
    .maybeSingle();
  if (error) {
    throw new AppError('WEBHOOK_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null || asWebhookRow(data).tenant_id !== tenantId) {
    throw new AppError('NOT_FOUND', 'Webhook not found', 404);
  }
  const { data: updated, error: updateError } = await supabase
    .from('webhook_endpoints')
    .update({ is_active: isActive, failure_count: isActive ? 0 : asWebhookRow(data).failure_count })
    .eq('id', webhookId)
    .select('*')
    .single();
  if (updateError || updated === null) {
    throw new AppError('WEBHOOK_UPDATE_FAILED', updateError?.message ?? 'Unable to update webhook', 500);
  }
  return mapWebhookRow(asWebhookRow(updated));
}

async function deliverOnce(
  url: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [API_CONFIG.webhooks.signatureHeader]: signature,
      },
      body,
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POSTs an event to every active tenant endpoint that subscribed to it.
 * Callers must fire-and-forget this — never await on the critical path.
 */
export async function dispatchWebhook(
  supabase: DbClient,
  tenantId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const result = (await supabase
    .from('webhook_endpoints')
    .select('*')
    .eq('tenant_id', tenantId)) as QueryResult<unknown[] | null>;
  if (result.error) {
    logger.error('webhook list failed', { message: result.error.message });
    return;
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  const targets = rows
    .map((row) => asWebhookRow(row))
    .filter((row) => row.is_active === true && (row.events ?? []).includes(event));

  const payloadObject = {
    event,
    timestamp: new Date().toISOString(),
    data: { ...data, tenantId },
  };
  const payload = JSON.stringify(payloadObject);
  const delays = retryDelays();

  for (const row of targets) {
    let secret: string;
    try {
      secret = decrypt(row.secret);
    } catch {
      logger.error('webhook secret decrypt failed', { webhookId: row.id });
      continue;
    }
    const signature = signWebhookPayload(payload, secret);
    let delivered = false;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      const delay = delays[attempt] ?? 0;
      if (attempt > 0) {
        await sleep(delay);
      }
      delivered = await deliverOnce(row.url, payload, signature);
      if (delivered) {
        break;
      }
    }

    if (delivered) {
      await supabase
        .from('webhook_endpoints')
        .update({
          last_triggered_at: new Date().toISOString(),
          failure_count: 0,
        })
        .eq('id', row.id);
    } else {
      const nextFailures = row.failure_count + 1;
      await supabase
        .from('webhook_endpoints')
        .update({
          failure_count: nextFailures,
          is_active: nextFailures < API_CONFIG.webhooks.maxFailures,
        })
        .eq('id', row.id);
      logger.warn('webhook delivery failed', {
        webhookId: row.id,
        urlHost: maskUrl(row.url),
        failures: nextFailures,
      });
    }
  }
}

/**
 * Fire-and-forget webhook dispatch. Never blocks order/payment flows.
 */
export function enqueueWebhook(
  supabase: DbClient,
  tenantId: string | null,
  event: WebhookEvent,
  data: Record<string, unknown>,
): void {
  if (!tenantId) {
    return;
  }
  void dispatchWebhook(supabase, tenantId, event, data).catch((error: unknown) => {
    logger.error('webhook dispatch failed', {
      tenantId,
      event,
      message: error instanceof Error ? error.message : 'unknown',
    });
  });
}
