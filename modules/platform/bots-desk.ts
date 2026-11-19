/**
 * Bot operations. Health calls Telegram getMe and getWebhookInfo and does not write.
 */

import { AppError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { telegramGetMe, telegramGetWebhookInfo } from '@/integrations/telegram/api';
import { decryptBotToken } from '@/integrations/telegram/webhook';
import { getDecryptedOwnerBotToken, getPlatformSettings } from '@/modules/platform';

export type BotCard = {
  readonly id: string;
  readonly username: string;
  readonly store: string;
  readonly owner: string;
  readonly status: string;
  readonly tokenValid: boolean | null;
  readonly webhookSet: boolean | null;
  readonly pendingUpdates: number | null;
  readonly lastUpdate: string | null;
  readonly orders: number;
  readonly revenue: string;
  readonly buyers: number;
  readonly conversion: string;
  readonly sparkline: readonly number[];
};

export type BotDetail = BotCard & {
  readonly ordersList: readonly { readonly id: string; readonly total: string; readonly at: string; readonly status: string }[];
  readonly buyersList: readonly { readonly id: string; readonly name: string }[];
  readonly errors: readonly string[];
};

function records(result: QueryResult<unknown>, code: string): Record<string, unknown>[] {
  if (result.error) throw new AppError(code, result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function money(minor: bigint): string {
  const whole = Number(minor) / 1_000_000;
  return whole.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function probe(token: string | null): Promise<{ tokenValid: boolean | null; webhookSet: boolean | null; pendingUpdates: number | null; lastUpdate: string | null }> {
  if (!token) return { tokenValid: false, webhookSet: false, pendingUpdates: null, lastUpdate: null };
  try {
    const info = await Promise.race([
      telegramGetMe(token).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2500)),
    ]);
    const hook = await Promise.race([
      telegramGetWebhookInfo(token),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    return {
      tokenValid: info,
      webhookSet: Boolean(hook && hook.url),
      pendingUpdates: hook ? hook.pending_update_count : null,
      lastUpdate: hook?.last_error_date ? new Date(hook.last_error_date * 1000).toISOString() : null,
    };
  } catch {
    return { tokenValid: false, webhookSet: null, pendingUpdates: null, lastUpdate: null };
  }
}

export async function readBots(db: DbClient, role: 'owner' | 'reseller', tenantId: string | null): Promise<{ readonly bots: readonly BotCard[] }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const orders = records(
    (await db.from('orders').select('id, tenant_id, bot_id, payment_status, quoted_retail_price, created_at').gte('created_at', since).limit(2000)) as QueryResult<unknown>,
    'BOTS_ORDERS_FAILED',
  );
  const customers = records(
    (await db.from('customers').select('id, bot_id').limit(2000)) as QueryResult<unknown>,
    'BOTS_BUYERS_FAILED',
  );
  const cards: BotCard[] = [];
  if (role === 'owner') {
    const settings = await getPlatformSettings(db);
    const token = await getDecryptedOwnerBotToken(db);
    const health = await probe(token);
    const mine = orders.filter((row) => text(row.tenant_id) === '' && text(row.channel) !== 'reseller_bot');
    cards.push(cardFor('owner', settings.ownerBotUsername ?? 'owner', 'Owner store', 'Owner', settings.ownerBotStatus, health, mine, customers.filter((row) => text(row.bot_id) === '').length));
    const bots = records((await db.from('bot_connections').select('id, tenant_id, username, status, last_health_at').order('username').limit(100)) as QueryResult<unknown>, 'BOTS_LIST_FAILED');
    const tenants = records((await db.from('tenants').select('id, display_name, owner_user_id').limit(200)) as QueryResult<unknown>, 'BOTS_TENANTS_FAILED');
    const profiles = records((await db.from('profiles').select('id, display_name').eq('role', 'reseller').limit(200)) as QueryResult<unknown>, 'BOTS_PROFILES_FAILED');
    for (const bot of bots) {
      const tenant = tenants.find((row) => text(row.id) === text(bot.tenant_id));
      const owner = profiles.find((row) => text(row.id) === text(tenant?.owner_user_id));
      const related = orders.filter((row) => text(row.bot_id) === text(bot.id) || text(row.tenant_id) === text(bot.tenant_id));
      const buyers = customers.filter((row) => text(row.bot_id) === text(bot.id)).length;
      cards.push(cardFor(text(bot.id), text(bot.username), text(tenant?.display_name) || 'Store', text(owner?.display_name) || 'Reseller', text(bot.status), { tokenValid: text(bot.status) === 'connected' ? null : false, webhookSet: text(bot.status) === 'connected' ? null : false, pendingUpdates: null, lastUpdate: text(bot.last_health_at) || null }, related, buyers));
    }
  } else if (tenantId) {
    const bots = records((await db.from('bot_connections').select('id, tenant_id, username, status, last_health_at').eq('tenant_id', tenantId).limit(5)) as QueryResult<unknown>, 'BOTS_LIST_FAILED');
    const tenant = records((await db.from('tenants').select('id, display_name').eq('id', tenantId).limit(1)) as QueryResult<unknown>, 'BOTS_TENANTS_FAILED')[0];
    for (const bot of bots) {
      const related = orders.filter((row) => text(row.tenant_id) === tenantId);
      const buyers = customers.filter((row) => text(row.bot_id) === text(bot.id)).length;
      cards.push(cardFor(text(bot.id), text(bot.username), text(tenant?.display_name) || 'Your store', 'You', text(bot.status), { tokenValid: null, webhookSet: null, pendingUpdates: null, lastUpdate: text(bot.last_health_at) || null }, related, buyers));
    }
  }
  return { bots: cards };
}

function cardFor(
  id: string,
  username: string,
  store: string,
  owner: string,
  status: string,
  health: { tokenValid: boolean | null; webhookSet: boolean | null; pendingUpdates: number | null; lastUpdate: string | null },
  orders: readonly Record<string, unknown>[],
  buyers: number,
): BotCard {
  const paid = orders.filter((row) => text(row.payment_status) === 'verified');
  const revenue = paid.reduce((sum, row) => sum + BigInt(typeof row.quoted_retail_price === 'string' || typeof row.quoted_retail_price === 'number' ? row.quoted_retail_price : 0), 0n);
  const days = [0, 0, 0, 0, 0, 0, 0];
  for (const row of paid) {
    const at = Date.parse(text(row.created_at));
    if (!Number.isFinite(at)) continue;
    const index = 6 - Math.min(6, Math.floor((Date.now() - at) / 86_400_000));
    if (index >= 0 && index < 7) {
      const current = days[index] ?? 0;
      days[index] = current + 1;
    }
  }
  const conversion = orders.length === 0 ? '0%' : `${Math.round((paid.length / orders.length) * 100)}%`;
  return {
    id,
    username: username.replace(/^@/, ''),
    store,
    owner,
    status: status || 'disconnected',
    ...health,
    orders: orders.length,
    revenue: money(revenue),
    buyers,
    conversion,
    sparkline: days,
  };
}

export async function readBotDetail(db: DbClient, role: 'owner' | 'reseller', tenantId: string | null, botId: string): Promise<BotDetail | null> {
  const list = await readBots(db, role, tenantId);
  const card = list.bots.find((bot) => bot.id === botId);
  if (!card) return null;
  let token: string | null = null;
  if (botId === 'owner' && role === 'owner') token = await getDecryptedOwnerBotToken(db);
  else {
    const row = (await db.from('bot_connections').select('encrypted_token, tenant_id').eq('id', botId).maybeSingle()) as QueryResult<Record<string, unknown> | null>;
    if (row.error) throw new AppError('BOTS_LIST_FAILED', row.error.message, 500);
    if (role === 'reseller' && text(row.data?.tenant_id) !== tenantId) return null;
    const encrypted = text(row.data?.encrypted_token);
    if (encrypted) {
      try {
        token = decryptBotToken(encrypted);
      } catch {
        token = null;
      }
    }
  }
  const health = await probe(token);
  const orders = records((await db.from('orders').select('id, quoted_retail_price, payment_status, created_at, bot_id, tenant_id').order('created_at', { ascending: false }).limit(12)) as QueryResult<unknown>, 'BOTS_ORDERS_FAILED')
    .filter((row) => botId === 'owner' ? text(row.tenant_id) === '' : text(row.bot_id) === botId || text(row.tenant_id) === tenantId);
  const buyers = records((await db.from('customers').select('id, username, first_name, bot_id').limit(12)) as QueryResult<unknown>, 'BOTS_BUYERS_FAILED')
    .filter((row) => botId === 'owner' ? text(row.bot_id) === '' : text(row.bot_id) === botId);
  const errors = health.lastUpdate ? ['The webhook reported an error. Open the log below.'] : [];
  return {
    ...card,
    ...health,
    ordersList: orders.slice(0, 8).map((row) => ({
      id: text(row.id),
      total: money(BigInt(typeof row.quoted_retail_price === 'string' || typeof row.quoted_retail_price === 'number' ? row.quoted_retail_price : 0)),
      at: text(row.created_at),
      status: text(row.payment_status),
    })),
    buyersList: buyers.slice(0, 8).map((row) => ({ id: text(row.id), name: text(row.username) || text(row.first_name) || 'Buyer' })),
    errors,
  };
}
