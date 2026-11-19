/**
 * @file modules/platform/store.ts
 *
 * Store editor data. Preview products are the ones the bot can sell.
 */

import { ValidationError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { listProducts } from '@/modules/catalog';
import { getBotConnection } from '@/modules/bots';
import { getPlatformSettings } from '@/modules/platform/index';
import { readStudio } from '@/modules/store-config/access';
import { getTenantSettings, updateTenantSettings } from '@/modules/tenant-settings';

export type PreviewProduct = {
  readonly id: string;
  readonly title: string;
  readonly category: string | null;
  readonly priceMinor: string;
  readonly stockUnlimited: boolean;
  readonly stockCount: number | null;
  readonly supplierInStock: boolean;
  readonly description: string | null;
  readonly durationText: string | null;
  readonly warrantyText: string | null;
  readonly deliveryType: 'file_reusable' | 'inventory_unit' | 'manual' | 'supplier_api';
  readonly requiresEmailActivation: boolean;
  readonly sample: boolean;
  readonly imageUrl: string | null;
};

function missing(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return error.code === '42703' || error.code === '42P01' || message.includes('does not exist') || message.includes('schema cache');
}

const SAMPLE: PreviewProduct = {
  id: 'sample',
  title: 'Sample product',
  category: 'Samples',
  priceMinor: '5000000',
  stockUnlimited: false,
  stockCount: 12,
  supplierInStock: true,
  description: 'This store has no products yet. This card is a sample.',
  durationText: '30 days',
  warrantyText: '7 days',
  deliveryType: 'manual',
  requiresEmailActivation: false,
  sample: true,
  imageUrl: null,
};

export async function readStore(db: DbClient, role: 'owner' | 'reseller', tenantId: string | null, userId: string) {
  const studio = await readStudio(db, role, tenantId);
  const products = await previewProducts(db, role, tenantId);
  const status = role === 'owner' ? await ownerStatus(db) : await resellerStatus(db, tenantId);
  const bot = role === 'owner' ? await ownerBot(db) : await resellerBot(db, tenantId);
  const history = await versions(db, role === 'owner' ? null : tenantId);
  const testChat = await readTestChat(db, userId);
  return { role, studio, products, ...status, bot, history, testChat };
}

export async function readStoreVersion(db: DbClient, role: 'owner' | 'reseller', tenantId: string | null, version: number) {
  const scope = role === 'owner' ? null : tenantId;
  const query = db.from('store_config_versions').select('version, config, saved_at').eq('version', version).limit(1);
  const result = (await (scope === null ? query.is('tenant_id', null) : query.eq('tenant_id', scope))) as QueryResult<unknown>;
  if (missing(result.error)) {
    throw new ValidationError('STORE_HISTORY_FAILED', 'Needs migration 0034 before a version can be restored.');
  }
  if (result.error) throw new ValidationError('STORE_HISTORY_FAILED', result.error.message);
  const row = Array.isArray(result.data) ? result.data[0] : null;
  if (!row || typeof row !== 'object') {
    throw new ValidationError('STORE_VERSION_MISSING', 'That version was not found.');
  }
  const record = row as Record<string, unknown>;
  return { version, config: record.config, savedAt: typeof record.saved_at === 'string' ? record.saved_at : '' };
}

async function readTestChat(db: DbClient, userId: string): Promise<{ readonly chatId: string | null; readonly needsMigration: boolean }> {
  const result = (await db.from('profiles').select('telegram_chat_id').eq('id', userId).maybeSingle()) as QueryResult<unknown>;
  if (missing(result.error)) return { chatId: null, needsMigration: true };
  if (result.error) throw new ValidationError('TEST_CHAT_FAILED', result.error.message);
  const row = result.data && typeof result.data === 'object' ? (result.data as Record<string, unknown>) : null;
  const chatId = typeof row?.telegram_chat_id === 'string' ? row.telegram_chat_id : null;
  return { chatId, needsMigration: false };
}

async function previewProducts(db: DbClient, role: 'owner' | 'reseller', tenantId: string | null): Promise<readonly PreviewProduct[]> {
  const catalog = await listProducts(db);
  const published = catalog.filter((product) => product.status === 'published');
  let allowed = published.length > 0 ? published : catalog.filter((product) => product.status !== 'archived').concat(catalog.filter((product) => product.status === 'archived'));
  const prices = new Map<string, bigint>();
  if (role === 'reseller' && tenantId) {
    const listings = (await db.from('reseller_listings').select('product_id, retail_price').eq('tenant_id', tenantId).eq('is_visible', true).limit(8)) as QueryResult<unknown>;
    const rows = Array.isArray(listings.data) ? listings.data : [];
    const ids = new Set<string>();
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      if (typeof row.product_id === 'string') {
        ids.add(row.product_id);
        if (typeof row.retail_price === 'string' || typeof row.retail_price === 'number') {
          prices.set(row.product_id, BigInt(row.retail_price));
        }
      }
    }
    allowed = allowed.filter((product) => ids.has(product.id));
  }
  const picked = allowed.slice(0, 8).map((product) => ({
    id: product.id,
    title: product.title,
    category: product.buyerCategory ?? product.category,
    priceMinor: (prices.get(product.id) ?? product.retailPriceMinor).toString(),
    stockUnlimited: product.stockUnlimited,
    stockCount: product.stockCount,
    supplierInStock: product.supplierInStock,
    description: product.description,
    durationText: product.durationText,
    warrantyText: product.warrantyText,
    deliveryType: product.deliveryType,
    requiresEmailActivation: product.requiresEmailActivation,
    sample: false,
    imageUrl: null,
  }));
  if (picked.length === 0) return [SAMPLE];
  const ids = picked.map((product) => product.id);
  const assets = (await db.from('product_assets').select('product_id, storage_path, is_preview').in('product_id', ids).limit(40)) as QueryResult<unknown>;
  if (assets.error || !Array.isArray(assets.data)) return picked;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  const images = new Map<string, string>();
  for (const raw of assets.data) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    if (row.is_preview !== true || typeof row.product_id !== 'string' || typeof row.storage_path !== 'string' || !base) continue;
    const path = row.storage_path.split('/').map((part) => encodeURIComponent(part)).join('/');
    images.set(row.product_id, `${base}/storage/v1/object/public/product-previews/${path}`);
  }
  return picked.map((product) => ({ ...product, imageUrl: images.get(product.id) ?? null }));
}

async function ownerStatus(db: DbClient): Promise<{ readonly storeStatus: 'open' | 'maintenance'; readonly maintenanceMessage: string; readonly statusNeedsMigration: boolean }> {
  const result = (await db.from('platform_settings').select('store_status, maintenance_msg').limit(1).maybeSingle()) as QueryResult<unknown>;
  if (missing(result.error) || !result.data || typeof result.data !== 'object') {
    return { storeStatus: 'open', maintenanceMessage: '', statusNeedsMigration: missing(result.error) };
  }
  const row = result.data as Record<string, unknown>;
  return {
    storeStatus: row.store_status === 'maintenance' ? 'maintenance' : 'open',
    maintenanceMessage: typeof row.maintenance_msg === 'string' ? row.maintenance_msg : '',
    statusNeedsMigration: false,
  };
}

async function resellerStatus(db: DbClient, tenantId: string | null) {
  if (!tenantId) {
    return { storeStatus: 'open' as const, maintenanceMessage: '', statusNeedsMigration: false };
  }
  const settings = await getTenantSettings(db, tenantId);
  return { storeStatus: settings.storeStatus, maintenanceMessage: settings.maintenanceMsg ?? '', statusNeedsMigration: false };
}

async function ownerBot(db: DbClient) {
  const settings = await getPlatformSettings(db);
  return {
    username: settings.ownerBotUsername,
    status: settings.ownerBotStatus,
    lastHealthAt: settings.ownerBotLastHealthAt ? settings.ownerBotLastHealthAt.toISOString() : null,
  };
}

async function resellerBot(db: DbClient, tenantId: string | null) {
  if (!tenantId) {
    return { username: null, status: 'disconnected', lastHealthAt: null };
  }
  const connection = await getBotConnection(db, tenantId);
  if (!connection) {
    return { username: null, status: 'disconnected', lastHealthAt: null };
  }
  return {
    username: connection.username,
    status: connection.status,
    lastHealthAt: connection.lastHealthAt ? connection.lastHealthAt.toISOString() : null,
  };
}

async function versions(db: DbClient, tenantId: string | null): Promise<readonly { readonly version: number; readonly savedAt: string }[]> {
  const query = db.from('store_config_versions').select('version, saved_at').order('version', { ascending: false }).limit(12);
  const result = (await (tenantId === null ? query.is('tenant_id', null) : query.eq('tenant_id', tenantId))) as QueryResult<unknown>;
  if (missing(result.error)) return [];
  if (result.error) throw new ValidationError('STORE_HISTORY_FAILED', result.error.message);
  if (!Array.isArray(result.data)) return [];
  return result.data.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const version = typeof record.version === 'number' ? record.version : Number(record.version);
    const savedAt = typeof record.saved_at === 'string' ? record.saved_at : '';
    if (!Number.isFinite(version) || !savedAt) return [];
    return [{ version, savedAt }];
  });
}

export async function saveOwnerStoreStatus(db: DbClient, status: 'open' | 'maintenance', message: string): Promise<{ readonly needsMigration: boolean }> {
  const current = (await db.from('platform_settings').select('id').limit(1).maybeSingle()) as QueryResult<unknown>;
  const row = current.data && typeof current.data === 'object' ? (current.data as Record<string, unknown>) : null;
  const id = typeof row?.id === 'string' ? row.id : '';
  if (!id) {
    throw new ValidationError('PLATFORM_SETTINGS_MISSING', 'Platform settings are missing, so the store status cannot be saved.');
  }
  const saved = await db.from('platform_settings').update({ store_status: status, maintenance_msg: message.slice(0, 500) }).eq('id', id);
  if (missing(saved.error)) {
    return { needsMigration: true };
  }
  if (saved.error) {
    throw new ValidationError('STORE_STATUS_FAILED', saved.error.message);
  }
  return { needsMigration: false };
}

export async function saveResellerStoreStatus(db: DbClient, tenantId: string, status: 'open' | 'maintenance', message: string): Promise<void> {
  await updateTenantSettings(db, tenantId, { storeStatus: status, maintenanceMsg: message.slice(0, 500) });
}
