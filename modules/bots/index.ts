/**
 * @file modules/bots/index.ts
 *
 * Bot connection public API. Tokens are never returned to clients.
 *
 * @module Bots
 */

import { decrypt, encrypt } from '@/lib/encryption';
import { AppError, NotFoundError, TenantError, ValidationError, WalletError } from '@/lib/errors';
import { getAppUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { OWNER_STORE_BOT_ID } from '@/lib/owner-bot';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { generateWebhookSecret } from '@/lib/tokens';
import {
  telegramDeleteWebhook,
  telegramGetMe,
  telegramGetWebhookInfo,
  telegramSetWebhook,
} from '@/integrations/telegram/api';
import { getTenantById } from '@/modules/tenants';
import { mapBotConnectionRow, mapBotConnectionWithToken, mapCustomerRow } from './map';
import type {
  BotConnection,
  BotConnectionRow,
  BotConnectionWithToken,
  ConnectBotInput,
  CustomerRecord,
  CustomerRow,
  ResellerBotOverview,
  TelegramUser,
} from './types';

export type {
  BotConnection,
  BotConnectionStatus,
  BotConnectionWithToken,
  BotInfo,
  ConnectBotInput,
  CustomerRecord,
  ResellerBotOverview,
  TelegramUser,
} from './types';
export { OWNER_STORE_BOT_ID };

const SANDBOX_NOW = new Date('2026-01-01T00:00:00.000Z');

/**
 * Rejects Telegram webhook registration when the app origin is not publicly reachable.
 *
 * Telegram will not deliver updates to localhost or loopback addresses.
 * Local development must run `npm run tunnel` so NEXT_PUBLIC_APP_URL is an HTTPS origin.
 *
 * @throws AppError WEBHOOK_URL_NOT_PUBLIC when the origin is localhost or 127.0.0.1
 */
function assertWebhookUrlIsPublic(): void {
  const appUrl = getAppUrl();
  if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
    throw new AppError(
      'WEBHOOK_URL_NOT_PUBLIC',
      'Bot connection requires a public URL. Run "npm run tunnel" in a separate terminal first, then restart the dev server.',
      400,
    );
  }
}

function asConnectionRow(data: unknown): BotConnectionRow {
  return data as BotConnectionRow;
}

function asCustomerRow(data: unknown): CustomerRow {
  return data as CustomerRow;
}

function webhookUrlFor(botConnectionId: string): string {
  return `${getAppUrl()}/api/webhooks/telegram/${botConnectionId}`;
}

/**
 * Returns a disconnected sandbox bot for a tenant.
 *
 * @param tenantId - Session-derived tenant id
 */
export function getSandboxBot(tenantId: string): BotConnection {
  return {
    id: '00000000-0000-4000-8000-000000000201',
    tenantId,
    telegramBotId: '0',
    username: 'sandbox_reseller_bot',
    webhookSecret: '',
    status: 'disconnected',
    lastHealthAt: null,
    createdAt: SANDBOX_NOW,
    updatedAt: SANDBOX_NOW,
  };
}

/**
 * Validates a bot token, encrypts it, stores the connection, and registers the webhook.
 *
 * @param supabase - Service-role database client
 * @param input - Tenant id and plaintext token (encrypted immediately)
 * @throws AppError WEBHOOK_URL_NOT_PUBLIC when NEXT_PUBLIC_APP_URL is localhost
 * SECURITY: bot token encrypted immediately, never returned
 */
export async function connectBot(supabase: DbClient, input: ConnectBotInput): Promise<BotConnection> {
  assertWebhookUrlIsPublic();

  const token = input.botToken.trim();
  if (token.length === 0) {
    throw new ValidationError('INVALID_BOT_TOKEN', 'Bot token is required');
  }

  const info = await telegramGetMe(token);
  if (!info.username) {
    throw new AppError('INVALID_BOT_TOKEN', 'Telegram rejected this bot token', 400);
  }

  const others = (await supabase.from('bot_connections').select('id, tenant_id, telegram_bot_id')) as QueryResult<
    unknown[] | null
  >;
  if (others.error) {
    throw new AppError('BOT_LOOKUP_FAILED', others.error.message, 500);
  }
  const conflict = (Array.isArray(others.data) ? others.data : []).find((row) => {
    const mapped = asConnectionRow(row);
    return mapped.telegram_bot_id === info.id && mapped.tenant_id !== input.tenantId;
  });
  if (conflict) {
    throw new AppError('BOT_ALREADY_CONNECTED', 'This bot is already connected to another account', 409);
  }

  const encryptedToken = encrypt(token);
  const webhookSecret = generateWebhookSecret();
  const now = new Date().toISOString();

  const existing = await supabase
    .from('bot_connections')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .maybeSingle();
  if (existing.error) {
    throw new AppError('BOT_LOOKUP_FAILED', existing.error.message, 500);
  }

  if (existing.data !== null) {
    const previous = mapBotConnectionWithToken(asConnectionRow(existing.data));
    if (previous.telegramBotId !== info.id) {
      try {
        await telegramDeleteWebhook(decrypt(previous.encryptedToken));
      } catch {
        logger.warn('failed to delete previous telegram webhook', { tenantId: input.tenantId });
      }
    }
  }

  let saved: BotConnectionRow;
  if (existing.data !== null) {
    const previous = asConnectionRow(existing.data);
    const { data, error } = await supabase
      .from('bot_connections')
      .update({
        telegram_bot_id: info.id,
        username: info.username,
        encrypted_token: encryptedToken,
        webhook_secret: webhookSecret,
        status: 'connected',
        updated_at: now,
      })
      .eq('id', previous.id)
      .select('*')
      .single();
    if (error || data === null) {
      throw new AppError('BOT_UPDATE_FAILED', error?.message ?? 'Unable to update bot connection', 500);
    }
    saved = asConnectionRow(data);
  } else {
    const { data, error } = await supabase
      .from('bot_connections')
      .insert({
        tenant_id: input.tenantId,
        telegram_bot_id: info.id,
        username: info.username,
        encrypted_token: encryptedToken,
        webhook_secret: webhookSecret,
        status: 'connected',
      })
      .select('*')
      .single();
    if (error || data === null) {
      throw new AppError('BOT_CREATE_FAILED', error?.message ?? 'Unable to store bot connection', 500);
    }
    saved = asConnectionRow(data);
  }

  try {
    await telegramSetWebhook(token, webhookUrlFor(saved.id), webhookSecret);
  } catch (error: unknown) {
    await supabase
      .from('bot_connections')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', saved.id);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('WEBHOOK_REGISTER_FAILED', 'Unable to register Telegram webhook', 502);
  }

  return mapBotConnectionRow(saved);
}

/**
 * Disconnects the tenant bot and deletes the Telegram webhook. Keeps the row.
 *
 * @param supabase - Service-role database client
 * @param tenantId - Session tenant id
 */
export async function disconnectBot(supabase: DbClient, tenantId: string): Promise<void> {
  const connection = await getBotConnection(supabase, tenantId);
  if (connection === null) {
    throw new NotFoundError('bot connection');
  }
  const withToken = await getBotConnectionById(supabase, connection.id);
  try {
    await telegramDeleteWebhook(decrypt(withToken.encryptedToken));
  } catch {
    logger.warn('failed to delete telegram webhook during disconnect', { tenantId });
  }
  const { error } = await supabase
    .from('bot_connections')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('id', connection.id);
  if (error) {
    throw new AppError('BOT_UPDATE_FAILED', error.message, 500);
  }
}

/**
 * Returns the bot connection for a tenant (no token field).
 *
 * @param supabase - Database client
 * @param tenantId - Tenant UUID
 */
export async function getBotConnection(supabase: DbClient, tenantId: string): Promise<BotConnection | null> {
  const { data, error } = await supabase
    .from('bot_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    throw new AppError('BOT_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    return null;
  }
  return mapBotConnectionRow(asConnectionRow(data));
}

/**
 * Internal use only — webhook handler decrypts the token after this call.
 * Never call from API routes that return data to clients.
 *
 * @param supabase - Database client
 * @param botConnectionId - bot_connections.id
 */
export async function getBotConnectionById(
  supabase: DbClient,
  botConnectionId: string,
): Promise<BotConnectionWithToken> {
  const { data, error } = await supabase
    .from('bot_connections')
    .select('*')
    .eq('id', botConnectionId)
    .maybeSingle();
  if (error) {
    throw new AppError('BOT_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('bot connection');
  }
  return mapBotConnectionWithToken(asConnectionRow(data));
}

/**
 * Updates last_health_at after successful webhook processing or a health cron tick.
 *
 * @param supabase - Database client
 * @param botConnectionId - bot_connections.id
 */
export async function updateBotHealth(supabase: DbClient, botConnectionId: string): Promise<void> {
  const { error } = await supabase
    .from('bot_connections')
    .update({ last_health_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', botConnectionId);
  if (error) {
    throw new AppError('BOT_HEALTH_UPDATE_FAILED', error.message, 500);
  }
}

/**
 * Marks a connected bot as error after a failed health check.
 *
 * @param supabase - Database client
 * @param botConnectionId - bot_connections.id
 */
export async function markBotError(supabase: DbClient, botConnectionId: string): Promise<void> {
  const { error } = await supabase
    .from('bot_connections')
    .update({ status: 'error', updated_at: new Date().toISOString() })
    .eq('id', botConnectionId);
  if (error) {
    throw new AppError('BOT_UPDATE_FAILED', error.message, 500);
  }
}

/**
 * Runs Telegram getWebhookInfo for every connected bot and refreshes last_health_at.
 *
 * @param supabase - Service-role database client
 */
export async function runBotHealthChecks(supabase: DbClient): Promise<{ checked: number; errors: number }> {
  const result = (await supabase.from('bot_connections').select('*').eq('status', 'connected')) as QueryResult<
    unknown[] | null
  >;
  if (result.error) {
    throw new AppError('BOT_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  let errors = 0;
  for (const row of rows) {
    const connection = mapBotConnectionWithToken(asConnectionRow(row));
    try {
      const info = await telegramGetWebhookInfo(decrypt(connection.encryptedToken));
      if (info.last_error_message) {
        await markBotError(supabase, connection.id);
        errors += 1;
      }
      await updateBotHealth(supabase, connection.id);
    } catch {
      await markBotError(supabase, connection.id);
      errors += 1;
    }
  }
  return { checked: rows.length, errors };
}

function isOwnerStoreBot(botId: string): boolean {
  return botId === OWNER_STORE_BOT_ID;
}

/**
 * Upserts a customer by (bot_id, telegram_user_id).
 *
 * @param supabase - Database client
 * @param botId - bot_connections.id, or owner sentinel
 * @param telegramUser - Telegram from-user
 * @param chatId - Telegram chat id
 */
export async function getOrCreateCustomer(
  supabase: DbClient,
  botId: string,
  telegramUser: TelegramUser,
  chatId?: string,
): Promise<CustomerRecord> {
  const telegramUserId = String(telegramUser.id);
  const telegramChatId = chatId ?? telegramUserId;
  const ownerStore = isOwnerStoreBot(botId);

  let existingQuery = supabase.from('customers').select('*').eq('telegram_user_id', telegramUserId);
  existingQuery = ownerStore ? existingQuery.is('bot_id', null) : existingQuery.eq('bot_id', botId);
  const existing = await existingQuery.maybeSingle();
  if (existing.error) {
    throw new AppError('CUSTOMER_LOOKUP_FAILED', existing.error.message, 500);
  }

  const firstName = telegramUser.first_name;
  const username = telegramUser.username ?? null;
  const now = new Date().toISOString();

  if (existing.data !== null) {
    const current = asCustomerRow(existing.data);
    const { data, error } = await supabase
      .from('customers')
      .update({
        telegram_chat_id: telegramChatId,
        first_name: firstName,
        username,
        updated_at: now,
      })
      .eq('id', current.id)
      .select('*')
      .single();
    if (error || data === null) {
      throw new AppError('CUSTOMER_UPDATE_FAILED', error?.message ?? 'Unable to update customer', 500);
    }
    return mapCustomerRow(asCustomerRow(data));
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      bot_id: ownerStore ? null : botId,
      telegram_user_id: telegramUserId,
      telegram_chat_id: telegramChatId,
      first_name: firstName,
      username,
      is_blocked: false,
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('CUSTOMER_CREATE_FAILED', error?.message ?? 'Unable to create customer', 500);
  }
  return mapCustomerRow(asCustomerRow(data));
}

/**
 * Loads a customer by id.
 *
 * @param supabase - Database client
 * @param customerId - Customer UUID
 */
export async function getCustomerById(supabase: DbClient, customerId: string): Promise<CustomerRecord> {
  const { data, error } = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle();
  if (error) {
    throw new AppError('CUSTOMER_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('customer');
  }
  return mapCustomerRow(asCustomerRow(data));
}

export async function setCustomerBlocked(
  supabase: DbClient,
  customerId: string,
  blocked: boolean,
): Promise<void> {
  const { data, error } = await supabase
    .from('customers')
    .update({ is_blocked: blocked, updated_at: new Date().toISOString() })
    .eq('id', customerId)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new AppError('CUSTOMER_UPDATE_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('customer');
  }
}

/**
 * Adjusts mapped buyer credit on the customers row.
 */
export async function adjustCustomerCredit(
  supabase: DbClient,
  customerId: string,
  deltaMinor: bigint,
): Promise<bigint> {
  const { data, error } = await supabase.rpc('adjust_customer_credit', {
    p_customer_id: customerId,
    p_delta: deltaMinor.toString(),
  });
  const row = Array.isArray(data) ? data[0] : null;
  const result =
    row && typeof row === 'object'
      ? (row as { success?: boolean; new_balance?: string | number | bigint; error_code?: string | null })
      : null;
  if (error || !result?.success) {
    throw new WalletError(
      result?.error_code ?? 'CREDIT_ADJUST_FAILED',
      'Failed to adjust customer credit',
    );
  }
  const balance = result.new_balance;
  if (typeof balance === 'bigint') {
    return balance;
  }
  if (typeof balance === 'string' || typeof balance === 'number') {
    return BigInt(balance);
  }
  throw new WalletError('CREDIT_ADJUST_FAILED', 'Failed to adjust customer credit');
}

/**
 * Blocks a customer from placing orders via the bot.
 *
 * @param supabase - Database client
 * @param customerId - Customer UUID
 */
export async function blockCustomer(supabase: DbClient, customerId: string): Promise<void> {
  await setCustomerBlocked(supabase, customerId, true);
}

/**
 * Lists customers who have messaged a bot.
 *
 * @param supabase - Database client
 * @param botId - bot_connections.id or owner sentinel
 */
export async function listCustomers(supabase: DbClient, botId: string): Promise<CustomerRecord[]> {
  const ownerStore = isOwnerStoreBot(botId);
  let query = supabase.from('customers').select('*').order('created_at', { ascending: false });
  query = ownerStore ? query.is('bot_id', null) : query.eq('bot_id', botId);
  const result = (await query) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('CUSTOMER_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapCustomerRow(asCustomerRow(row)));
}

/**
 * Lists every reseller bot connection with tenant names and customer counts.
 *
 * @param supabase - Service-role database client
 */
export async function listResellerBotOverview(supabase: DbClient): Promise<ResellerBotOverview[]> {
  const result = (await supabase
    .from('bot_connections')
    .select('*')
    .order('created_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('BOT_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  const items: ResellerBotOverview[] = [];
  for (const row of rows) {
    const connection = mapBotConnectionRow(asConnectionRow(row));
    const tenant = await getTenantById(supabase, connection.tenantId);
    const customers = await listCustomers(supabase, connection.id);
    items.push({
      connection,
      tenantName: tenant.displayName,
      resellerName: tenant.displayName,
      customerCount: customers.length,
    });
  }
  return items;
}

/**
 * Ensures the reseller tenant is active before connecting a bot.
 *
 * @param status - Tenant account status
 */
export function assertTenantCanConnectBot(status: string): void {
  if (status !== 'active') {
    throw new TenantError(
      'TENANT_NOT_ACTIVE',
      'Your account must be activated by the owner before you can connect a bot.',
      403,
    );
  }
}
