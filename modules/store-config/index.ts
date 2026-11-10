/**
 * Per-store Bot Studio config. A missing row means the bot keeps today's defaults.
 */

import { AppError, ValidationError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { ZodError } from 'zod';
import { DEFAULT_STORE_CONFIG } from '@/modules/store-config/defaults';
import { StoreConfigSchema, buttonSchema, customLinksSchema, linkSchema } from '@/modules/store-config/schema';
import type { ButtonKey, StoreConfig, StoredStoreConfig } from '@/modules/store-config/types';
import { BUTTON_KEYS } from '@/modules/store-config/types';

const CONFIG_CACHE = new Map<string, { data: StoredStoreConfig; expiresAt: number }>();
const CONFIG_TTL_MS = 30_000;

type ConfigRow = {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly config: unknown;
  readonly version: number;
};

function cacheKey(tenantId: string | null): string {
  return tenantId ?? 'owner';
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function mergeButtons(stored: unknown): StoreConfig['buttons'] {
  const source = asObject(stored);
  const next = { ...DEFAULT_STORE_CONFIG.buttons };
  if (!source) {
    return next;
  }
  for (const key of BUTTON_KEYS) {
    const row = asObject(source[key]);
    if (!row) {
      continue;
    }
    const parsed = buttonSchema.safeParse({
      ...next[key],
      ...row,
    });
    if (parsed.success) {
      next[key] = parsed.data;
    }
  }
  return next;
}

function mergeLink(stored: unknown, fallback: StoreConfig['links']['channel']): StoreConfig['links']['channel'] {
  const row = asObject(stored);
  if (!row) {
    return fallback;
  }
  const parsed = linkSchema.safeParse({
    label: typeof row.label === 'string' ? row.label : fallback.label,
    url: typeof row.url === 'string' ? row.url : fallback.url,
  });
  return parsed.success ? parsed.data : fallback;
}

/**
 * Merges a stored JSON object over the defaults. Invalid pieces are dropped.
 */
export function mergeStoreConfig(stored: unknown): StoreConfig {
  const source = asObject(stored);
  if (!source) {
    return DEFAULT_STORE_CONFIG;
  }
  const links = asObject(source.links);
  const messages = asObject(source.messages);
  const custom = Array.isArray(source.customLinks) ? source.customLinks : [];
  const parsedLinks = customLinksSchema.safeParse(custom);
  const welcome = typeof source.welcome === 'string' ? source.welcome.trim() : '';
  const message = (key: keyof StoreConfig['messages']): string => {
    const value = messages?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : DEFAULT_STORE_CONFIG.messages[key];
  };
  return {
    welcome: welcome.length > 0 && welcome.length <= 2000 ? welcome : DEFAULT_STORE_CONFIG.welcome,
    buttons: mergeButtons(source.buttons),
    customLinks: parsedLinks.success ? parsedLinks.data : [],
    links: {
      channel: mergeLink(links?.channel, DEFAULT_STORE_CONFIG.links.channel),
      group: mergeLink(links?.group, DEFAULT_STORE_CONFIG.links.group),
      website: mergeLink(links?.website, DEFAULT_STORE_CONFIG.links.website),
    },
    messages: {
      supportIntro: message('supportIntro'),
      checkoutHeader: message('checkoutHeader'),
      orderProcessing: message('orderProcessing'),
      orderDelivered: message('orderDelivered'),
    },
  };
}

export function parseStoreConfig(input: unknown): StoreConfig {
  try {
    return StoreConfigSchema.parse(input);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      throw new ValidationError('INVALID_STORE_CONFIG', issue?.message ?? 'Check the Bot Studio fields');
    }
    throw error;
  }
}

async function readRow(supabase: DbClient, tenantId: string | null): Promise<ConfigRow | null> {
  const query = supabase.from('store_config').select('id, tenant_id, config, version');
  const result = (
    tenantId === null ? query.is('tenant_id', null) : query.eq('tenant_id', tenantId)
  ).maybeSingle() as Promise<QueryResult<ConfigRow | null>>;
  const { data, error } = await result;
  if (error) {
    if (/store_config|does not exist|schema cache/i.test(error.message)) {
      return null;
    }
    throw new AppError('STORE_CONFIG_READ_FAILED', error.message, 500);
  }
  return data;
}

export async function getStoreConfig(supabase: DbClient, tenantId: string | null): Promise<StoredStoreConfig> {
  const row = await readRow(supabase, tenantId);
  if (!row) {
    return { config: DEFAULT_STORE_CONFIG, version: 0, source: 'default' };
  }
  return { config: mergeStoreConfig(row.config), version: row.version, source: 'stored' };
}

export async function getStoreConfigCached(supabase: DbClient, tenantId: string | null): Promise<StoredStoreConfig> {
  const key = cacheKey(tenantId);
  const hit = CONFIG_CACHE.get(key);
  if (hit && Date.now() <= hit.expiresAt) {
    return hit.data;
  }
  const data = await getStoreConfig(supabase, tenantId);
  CONFIG_CACHE.set(key, { data, expiresAt: Date.now() + CONFIG_TTL_MS });
  return data;
}

async function writeAudit(
  supabase: DbClient,
  actorId: string,
  targetId: string,
  version: number,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: actorId,
    action: 'store_config.save',
    target_type: 'store_config',
    target_id: targetId,
    after_val: { version },
    reason: 'bot studio save',
  });
  if (error) {
    throw new AppError('AUDIT_WRITE_FAILED', error.message, 500);
  }
}

/**
 * Validates and saves one store. expectedVersion 0 inserts the first row.
 * A mismatched version is rejected so two editors cannot overwrite each other.
 */
export async function saveStoreConfig(
  supabase: DbClient,
  tenantId: string | null,
  input: unknown,
  actorId: string,
  expectedVersion: number,
): Promise<StoredStoreConfig> {
  const config = parseStoreConfig(input);
  const existing = await readRow(supabase, tenantId);
  if (existing && existing.version !== expectedVersion) {
    throw new AppError('CONFIG_CONFLICT', 'This was changed elsewhere. Reload to see the latest.', 409);
  }
  if (!existing && expectedVersion !== 0) {
    throw new AppError('CONFIG_CONFLICT', 'This was changed elsewhere. Reload to see the latest.', 409);
  }
  const now = new Date().toISOString();
  if (!existing) {
    const inserted = (await supabase
      .from('store_config')
      .insert({
        tenant_id: tenantId,
        config,
        version: 1,
        updated_by: actorId,
        created_at: now,
        updated_at: now,
      })
      .select('id, version')
      .single()) as QueryResult<{ id: string; version: number } | null>;
    if (inserted.error || !inserted.data) {
      throw new AppError('STORE_CONFIG_SAVE_FAILED', inserted.error?.message ?? 'Unable to save', 500);
    }
    await writeAudit(supabase, actorId, inserted.data.id, inserted.data.version);
    CONFIG_CACHE.delete(cacheKey(tenantId));
    return { config, version: inserted.data.version, source: 'stored' };
  }
  const updated = (await supabase
    .from('store_config')
    .update({
      config,
      version: existing.version + 1,
      updated_by: actorId,
      updated_at: now,
    })
    .eq('id', existing.id)
    .eq('version', String(expectedVersion))
    .select('id, version')) as QueryResult<Array<{ id: string; version: number }> | null>;
  const row = Array.isArray(updated.data) ? updated.data[0] : null;
  if (updated.error) {
    throw new AppError('STORE_CONFIG_SAVE_FAILED', updated.error.message, 500);
  }
  if (!row) {
    throw new AppError('CONFIG_CONFLICT', 'This was changed elsewhere. Reload to see the latest.', 409);
  }
  await writeAudit(supabase, actorId, row.id, row.version);
  CONFIG_CACHE.delete(cacheKey(tenantId));
  return { config, version: row.version, source: 'stored' };
}

export function buttonOrder(config: StoreConfig): ButtonKey[] {
  return [...BUTTON_KEYS].sort((left, right) => config.buttons[left].order - config.buttons[right].order);
}

export const STORE_CONFIG_CACHE_MS = CONFIG_TTL_MS;
