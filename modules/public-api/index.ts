/**
 * @file modules/public-api/index.ts
 *
 * API key management and request authentication for the public v1 API.
 *
 * Key format: btc_{env}_{32 random hex chars}
 * Key storage: SHA-256 hash stored in DB, raw key shown once and discarded
 *
 * SECURITY INVARIANTS:
 * - Raw key never stored in DB, logs, or responses after creation
 * - Key hash is the only thing stored (SHA-256)
 * - Every request hashes the submitted key and compares to stored hash
 * - Timing-safe comparison to prevent timing attacks
 * - Rate limiting enforced per key ID (not per IP)
 * - Scope checked per endpoint
 *
 * @module PublicApi
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { API_CONFIG } from '@/lib/api-config';
import { AppError, AuthError, NotFoundError, ValidationError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rate-limiter';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import type {
  ApiKey,
  ApiKeyCreationResult,
  ApiKeyRow,
  ApiScope,
  AuthenticatedApiContext,
  CreateApiKeyInput,
} from './types';

export type {
  ApiKey,
  ApiKeyCreationResult,
  ApiScope,
  AuthenticatedApiContext,
  CreateApiKeyInput,
  CreateWebhookInput,
  WebhookCreationResult,
  WebhookEndpoint,
  WebhookEvent,
} from './types';

const GENERIC_AUTH_MESSAGE = 'Invalid API key';
const DUMMY_HASH = '0'.repeat(64);

function asApiKeyRow(data: unknown): ApiKeyRow {
  return data as ApiKeyRow;
}

function asEnvironment(value: string): 'live' | 'test' {
  return value === 'live' ? 'live' : 'test';
}

function asScope(value: string): ApiScope | null {
  const scopes: readonly string[] = API_CONFIG.allScopes;
  if (scopes.includes(value)) {
    return value as ApiScope;
  }
  return null;
}

function mapApiKeyRow(row: ApiKeyRow): ApiKey {
  const scopes = (row.scopes ?? [])
    .map((scope) => asScope(scope))
    .filter((scope): scope is ApiScope => scope !== null);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    keyPrefix: row.key_prefix,
    label: row.label,
    environment: asEnvironment(row.environment),
    scopes,
    isActive: row.is_active === true,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    createdAt: new Date(row.created_at),
  };
}

/**
 * SHA-256 hex digest of a raw API key. Never log the input.
 */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

function hashesMatch(leftHex: string, rightHex: string): boolean {
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }
  return new Date(expiresAt).getTime() <= Date.now();
}

async function writeAuditLog(
  supabase: DbClient,
  entry: {
    readonly actorId: string;
    readonly action: string;
    readonly targetId: string;
    readonly reason: string;
    readonly afterVal?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_type: 'api_key',
    target_id: entry.targetId,
    after_val: entry.afterVal ?? null,
    reason: entry.reason,
  });
  if (error) {
    throw new AppError('AUDIT_WRITE_FAILED', error.message, 500);
  }
}

/**
 * Issues a new API key. The raw key is returned once and never stored.
 */
export async function generateApiKey(
  supabase: DbClient,
  input: CreateApiKeyInput,
): Promise<ApiKeyCreationResult> {
  const label = input.label.trim();
  if (label.length < 2) {
    throw new ValidationError('VALIDATION_ERROR', 'Label is required');
  }
  const prefix = input.environment === 'live' ? API_CONFIG.keyPrefix.live : API_CONFIG.keyPrefix.test;
  const rawKey = `${prefix}${randomBytes(16).toString('hex')}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 16);
  const scopes = input.scopes && input.scopes.length > 0 ? input.scopes : [...API_CONFIG.defaultScopes];

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      tenant_id: input.tenantId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      label,
      environment: input.environment,
      scopes,
      is_active: true,
      expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
      created_by: input.createdBy,
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('API_KEY_CREATE_FAILED', error?.message ?? 'Unable to create API key', 500);
  }

  const apiKey = mapApiKeyRow(asApiKeyRow(data));
  await writeAuditLog(supabase, {
    actorId: input.createdBy,
    action: 'api_key.created',
    targetId: apiKey.id,
    reason: label,
    afterVal: { environment: apiKey.environment, keyPrefix: apiKey.keyPrefix },
  });
  return { apiKey, rawKey };
}

/**
 * Authenticates a raw API key. Failures never reveal whether the key exists.
 */
export async function authenticateApiRequest(
  supabase: DbClient,
  rawKey: string,
): Promise<AuthenticatedApiContext> {
  const submitted = rawKey.trim();
  const computedHash = hashApiKey(submitted);
  const { data, error } = await supabase.from('api_keys').select('*').eq('key_hash', computedHash).maybeSingle();
  if (error) {
    throw new AppError('API_KEY_LOOKUP_FAILED', error.message, 500);
  }

  const row = data !== null ? asApiKeyRow(data) : null;
  const storedHash = row?.key_hash ?? DUMMY_HASH;
  const match = hashesMatch(computedHash, storedHash);

  if (!match || row === null || row.is_active !== true || isExpired(row.expires_at)) {
    throw new AuthError(API_CONFIG.errors.UNAUTHORIZED, GENERIC_AUTH_MESSAGE, 401);
  }

  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(() => undefined, () => undefined);

  return {
    tenantId: row.tenant_id,
    apiKeyId: row.id,
    scopes: mapApiKeyRow(row).scopes,
    environment: asEnvironment(row.environment),
  };
}

/**
 * Requires a scope on the authenticated API context.
 */
export function requireScope(context: AuthenticatedApiContext, scope: ApiScope): void {
  if (!context.scopes.includes(scope)) {
    throw new AuthError(API_CONFIG.errors.FORBIDDEN, 'Insufficient API key scope', 403);
  }
}

/**
 * Lists API keys for a tenant. Never includes hashes or raw keys.
 */
export async function listApiKeys(supabase: DbClient, tenantId: string): Promise<ApiKey[]> {
  const result = (await supabase
    .from('api_keys')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('API_KEY_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapApiKeyRow(asApiKeyRow(row)));
}

/**
 * Revokes an API key. Subsequent requests fail authentication.
 */
export async function revokeApiKey(supabase: DbClient, keyId: string, revokedBy: string): Promise<void> {
  const { data, error } = await supabase.from('api_keys').select('*').eq('id', keyId).maybeSingle();
  if (error) {
    throw new AppError('API_KEY_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('api key');
  }
  const { error: updateError } = await supabase
    .from('api_keys')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: revokedBy,
    })
    .eq('id', keyId);
  if (updateError) {
    throw new AppError('API_KEY_REVOKE_FAILED', updateError.message, 500);
  }
  await writeAuditLog(supabase, {
    actorId: revokedBy,
    action: 'api_key.revoked',
    targetId: keyId,
    reason: 'revoked',
  });
}

/**
 * Sliding-window rate limit check keyed by API key ID and endpoint name.
 */
export async function rateLimit(
  keyId: string,
  endpoint: string,
  limit: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const result = checkRateLimit(`apikey:${keyId}:${endpoint}`, limit);
  return { allowed: result.allowed, remaining: result.remaining, resetAt: result.resetAt };
}
