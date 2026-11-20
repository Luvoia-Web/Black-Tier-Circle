/**
 * Bot operations. Health calls Telegram getMe and getWebhookInfo and does not write.
 */

import { AppError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { telegramGetMe, telegramGetWebhookInfo } from '@/integrations/telegram/api';
import { decryptBotToken } from '@/integrations/telegram/webhook';
import {
  BOT_TOKEN_DECRYPT_ERROR_MESSAGE,
  getPlatformSettings,
  readOwnerBotPaused,
  readOwnerBotTokenState,
} from '@/modules/platform';

export type BotConnectionState =
  | 'Connected'
  | 'Paused'
  | 'Disconnected'
  | 'Error'
  | 'Token unreadable';

export type BotCard = {
  readonly id: string;
  readonly username: string;
  readonly store: string;
  readonly owner: string;
  readonly status: string;
  readonly connectionState: BotConnectionState;
  readonly connectionDetail: string | null;
  readonly tokenValid: boolean | null;
  readonly webhookSet: boolean | null;
  readonly pendingUpdates: number | null;
  readonly lastUpdate: string | null;
  readonly orders: number;
  readonly paidOrders: number;
  readonly revenue: string;
  readonly orders7d: number;
  readonly revenue7d: string;
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

function rowMinor(value: unknown): bigint {
  try {
    return BigInt(typeof value === 'string' || typeof value === 'number' ? value : 0);
  } catch {
    return 0n;
  }
}

type ProbeResult = {
  readonly tokenValid: boolean | null;
  readonly webhookSet: boolean | null;
  readonly pendingUpdates: number | null;
  readonly lastUpdate: string | null;
  readonly webhookError: string | null;
};

async function probe(token: string | null): Promise<ProbeResult> {
  if (!token) {
    return { tokenValid: false, webhookSet: false, pendingUpdates: null, lastUpdate: null, webhookError: null };
  }
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
      webhookError: hook?.last_error_message ?? null,
    };
  } catch {
    return { tokenValid: false, webhookSet: null, pendingUpdates: null, lastUpdate: null, webhookError: null };
  }
}

function resolveState(
  storedStatus: string,
  paused: boolean,
  decryptFailed: boolean,
  tokenValid: boolean | null,
  webhookSet: boolean | null,
  webhookError: string | null,
): { readonly connectionState: BotConnectionState; readonly connectionDetail: string | null } {
  if (decryptFailed) {
    return { connectionState: 'Token unreadable', connectionDetail: BOT_TOKEN_DECRYPT_ERROR_MESSAGE };
  }
  if (paused || storedStatus === 'paused') {
    return { connectionState: 'Paused', connectionDetail: 'Paused from the dashboard.' };
  }
  if (storedStatus === 'disconnected') {
    return { connectionState: 'Disconnected', connectionDetail: null };
  }
  if (storedStatus === 'error' || tokenValid === false) {
    return {
      connectionState: 'Error',
      connectionDetail: webhookError || 'Telegram rejected the token or reported a webhook error.',
    };
  }
  if (webhookSet === false) {
    return { connectionState: 'Error', connectionDetail: 'Webhook is not registered with Telegram.' };
  }
  return { connectionState: 'Connected', connectionDetail: webhookError };
}

export async function readBots(
  db: DbClient,
  role: 'owner' | 'reseller',
  tenantId: string | null,
): Promise<{ readonly bots: readonly BotCard[] }> {
  if (role === 'reseller' && !tenantId) {
    return { bots: [] };
  }
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let ordersQuery = db
    .from('orders')
    .select('id, tenant_id, bot_id, channel, payment_status, quoted_retail_price, created_at')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (role === 'reseller' && tenantId) {
    ordersQuery = ordersQuery.eq('tenant_id', tenantId);
  }
  const orders = records((await ordersQuery) as QueryResult<unknown>, 'BOTS_ORDERS_FAILED');
  const cards: BotCard[] = [];
  if (role === 'owner') {
    const customers = records(
      (await db.from('customers').select('id, bot_id').limit(5000)) as QueryResult<unknown>,
      'BOTS_BUYERS_FAILED',
    );
    const [settings, tokenState, paused] = await Promise.all([
      getPlatformSettings(db),
      readOwnerBotTokenState(db),
      readOwnerBotPaused(db),
    ]);
    const health =
      tokenState.status === 'ok'
        ? await probe(tokenState.token)
        : { tokenValid: null, webhookSet: null, pendingUpdates: null, lastUpdate: null, webhookError: null };
    const effectiveStatus = paused ? 'paused' : settings.ownerBotStatus;
    const resolved = resolveState(
      settings.ownerBotStatus,
      paused,
      tokenState.status === 'decrypt_failed',
      health.tokenValid,
      health.webhookSet,
      health.webhookError,
    );
    const mine = orders.filter((row) => text(row.tenant_id) === '' && text(row.channel) !== 'reseller_bot');
    const ownerBuyers = customers.filter((row) => text(row.bot_id) === '').length;
    cards.push(
      cardFor(
        'owner',
        settings.ownerBotUsername ?? 'owner',
        'Owner store',
        'Owner',
        effectiveStatus,
        resolved,
        health,
        mine,
        ownerBuyers,
        sinceMs,
      ),
    );
    const bots = records(
      (await db.from('bot_connections').select('id, tenant_id, username, status, encrypted_token, last_health_at').order('username').limit(100)) as QueryResult<unknown>,
      'BOTS_LIST_FAILED',
    );
    const tenants = records((await db.from('tenants').select('id, display_name, owner_user_id').limit(200)) as QueryResult<unknown>, 'BOTS_TENANTS_FAILED');
    const profiles = records((await db.from('profiles').select('id, display_name').eq('role', 'reseller').limit(200)) as QueryResult<unknown>, 'BOTS_PROFILES_FAILED');
    for (const bot of bots) {
      const tenant = tenants.find((row) => text(row.id) === text(bot.tenant_id));
      const owner = profiles.find((row) => text(row.id) === text(tenant?.owner_user_id));
      const related = orders.filter((row) => text(row.bot_id) === text(bot.id) || text(row.tenant_id) === text(bot.tenant_id));
      const buyers = customers.filter((row) => text(row.bot_id) === text(bot.id)).length;
      let decryptFailed = false;
      const encrypted = text(bot.encrypted_token);
      if (encrypted) {
        try {
          decryptBotToken(encrypted);
        } catch {
          decryptFailed = true;
        }
      }
      const storedStatus = text(bot.status) || 'disconnected';
      const resolvedBot = resolveState(storedStatus, storedStatus === 'paused', decryptFailed, null, null, null);
      cards.push(
        cardFor(
          text(bot.id),
          text(bot.username),
          text(tenant?.display_name) || 'Store',
          text(owner?.display_name) || 'Reseller',
          storedStatus,
          resolvedBot,
          { tokenValid: null, webhookSet: null, pendingUpdates: null, lastUpdate: text(bot.last_health_at) || null, webhookError: null },
          related,
          buyers,
          sinceMs,
        ),
      );
    }
  } else if (tenantId) {
    const bots = records(
      (await db.from('bot_connections').select('id, tenant_id, username, status, encrypted_token, last_health_at').eq('tenant_id', tenantId).limit(5)) as QueryResult<unknown>,
      'BOTS_LIST_FAILED',
    );
    const botIds = bots.map((b) => text(b.id)).filter(Boolean);
    const customers =
      botIds.length > 0
        ? records(
            (await db.from('customers').select('id, bot_id').in('bot_id', botIds).limit(5000)) as QueryResult<unknown>,
            'BOTS_BUYERS_FAILED',
          )
        : [];
    const tenant = records((await db.from('tenants').select('id, display_name').eq('id', tenantId).limit(1)) as QueryResult<unknown>, 'BOTS_TENANTS_FAILED')[0];
    for (const bot of bots) {
      const related = orders.filter((row) => text(row.tenant_id) === tenantId);
      const buyers = customers.filter((row) => text(row.bot_id) === text(bot.id)).length;
      let decryptFailed = false;
      const encrypted = text(bot.encrypted_token);
      if (encrypted) {
        try {
          decryptBotToken(encrypted);
        } catch {
          decryptFailed = true;
        }
      }
      const storedStatus = text(bot.status) || 'disconnected';
      const resolvedBot = resolveState(storedStatus, storedStatus === 'paused', decryptFailed, null, null, null);
      cards.push(
        cardFor(
          text(bot.id),
          text(bot.username),
          text(tenant?.display_name) || 'Your store',
          'You',
          storedStatus,
          resolvedBot,
          { tokenValid: null, webhookSet: null, pendingUpdates: null, lastUpdate: text(bot.last_health_at) || null, webhookError: null },
          related,
          buyers,
          sinceMs,
        ),
      );
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
  resolved: { readonly connectionState: BotConnectionState; readonly connectionDetail: string | null },
  health: ProbeResult,
  orders: readonly Record<string, unknown>[],
  buyers: number,
  sinceMs: number,
): BotCard {
  const paidAll = orders.filter((row) => text(row.payment_status) === 'verified');
  const revenueAll = paidAll.reduce((sum, row) => sum + rowMinor(row.quoted_retail_price), 0n);

  const ordersIn7d = orders.filter((row) => {
    const at = Date.parse(text(row.created_at));
    return Number.isFinite(at) && at >= sinceMs;
  });
  const paid7d = ordersIn7d.filter((row) => text(row.payment_status) === 'verified');
  const revenue7d = paid7d.reduce((sum, row) => sum + rowMinor(row.quoted_retail_price), 0n);

  const days = [0, 0, 0, 0, 0, 0, 0];
  for (const row of paid7d) {
    const at = Date.parse(text(row.created_at));
    if (!Number.isFinite(at)) continue;
    const index = 6 - Math.min(6, Math.floor((Date.now() - at) / 86_400_000));
    if (index >= 0 && index < 7) {
      days[index] = (days[index] ?? 0) + 1;
    }
  }
  const conversion = orders.length === 0 ? '0%' : `${Math.round((paidAll.length / orders.length) * 100)}%`;
  return {
    id,
    username: username.replace(/^@/, ''),
    store,
    owner,
    status: status || 'disconnected',
    connectionState: resolved.connectionState,
    connectionDetail: resolved.connectionDetail,
    tokenValid: health.tokenValid,
    webhookSet: health.webhookSet,
    pendingUpdates: health.pendingUpdates,
    lastUpdate: health.lastUpdate,
    orders: orders.length,
    paidOrders: paidAll.length,
    revenue: money(revenueAll),
    orders7d: ordersIn7d.length,
    revenue7d: money(revenue7d),
    buyers,
    conversion,
    sparkline: days,
  };
}

export async function readBotDetail(
  db: DbClient,
  role: 'owner' | 'reseller',
  tenantId: string | null,
  botId: string,
): Promise<BotDetail | null> {
  const list = await readBots(db, role, tenantId);
  const card = list.bots.find((bot) => bot.id === botId);
  if (!card) return null;

  let token: string | null = null;
  let decryptFailed = false;
  let rowTenantId: string | null = null;
  if (botId === 'owner' && role === 'owner') {
    const state = await readOwnerBotTokenState(db);
    if (state.status === 'ok') token = state.token;
    else if (state.status === 'decrypt_failed') decryptFailed = true;
  } else {
    const row = (await db.from('bot_connections').select('encrypted_token, tenant_id').eq('id', botId).maybeSingle()) as QueryResult<Record<string, unknown> | null>;
    if (row.error) throw new AppError('BOTS_LIST_FAILED', row.error.message, 500);
    rowTenantId = text(row.data?.tenant_id) || null;
    if (role === 'reseller' && (!tenantId || rowTenantId !== tenantId)) return null;
    const encrypted = text(row.data?.encrypted_token);
    if (encrypted) {
      try {
        token = decryptBotToken(encrypted);
      } catch {
        decryptFailed = true;
        token = null;
      }
    }
  }

  const health: ProbeResult = token
    ? await probe(token)
    : { tokenValid: null, webhookSet: null, pendingUpdates: null, lastUpdate: card.lastUpdate, webhookError: null };
  const resolved = resolveState(card.status, card.status === 'paused', decryptFailed, health.tokenValid, health.webhookSet, health.webhookError);

  let ordersQuery = db
    .from('orders')
    .select('id, quoted_retail_price, payment_status, created_at, bot_id, tenant_id, channel')
    .order('created_at', { ascending: false })
    .limit(24);
  let buyersQuery = db.from('customers').select('id, username, first_name, bot_id').limit(12);
  if (botId === 'owner') {
    ordersQuery = ordersQuery.is('tenant_id', null);
    buyersQuery = buyersQuery.is('bot_id', null);
  } else if (rowTenantId) {
    ordersQuery = ordersQuery.eq('tenant_id', rowTenantId);
    buyersQuery = buyersQuery.eq('bot_id', botId);
  } else {
    ordersQuery = ordersQuery.eq('bot_id', botId);
    buyersQuery = buyersQuery.eq('bot_id', botId);
  }
  const orders = records((await ordersQuery) as QueryResult<unknown>, 'BOTS_ORDERS_FAILED').filter((row) =>
    botId === 'owner'
      ? text(row.tenant_id) === '' && text(row.channel) !== 'reseller_bot'
      : true,
  );
  const buyers = records((await buyersQuery) as QueryResult<unknown>, 'BOTS_BUYERS_FAILED');

  const errors: string[] = [];
  if (decryptFailed) errors.push(BOT_TOKEN_DECRYPT_ERROR_MESSAGE);
  else if (health.webhookError) errors.push(health.webhookError);
  else if (health.lastUpdate) errors.push('The webhook reported a delivery error on the last check.');

  return {
    ...card,
    ...resolved,
    tokenValid: health.tokenValid,
    webhookSet: health.webhookSet,
    pendingUpdates: health.pendingUpdates,
    lastUpdate: health.lastUpdate,
    ordersList: orders.slice(0, 8).map((row) => ({
      id: text(row.id),
      total: money(rowMinor(row.quoted_retail_price)),
      at: text(row.created_at),
      status: text(row.payment_status),
    })),
    buyersList: buyers.slice(0, 8).map((row) => ({ id: text(row.id), name: text(row.username) || text(row.first_name) || 'Buyer' })),
    errors,
  };
}
