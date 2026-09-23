/**
 * @file modules/platform/index.ts
 *
 * Owner-managed platform settings. Bot tokens and Binance secrets are encrypted
 * with BOT_TOKEN_ENCRYPTION_KEY and never returned to the browser.
 *
 * @module Platform
 */

import {
  telegramDeleteWebhook,
  telegramGetMe,
  telegramSetWebhook,
} from '@/integrations/telegram/api';
import { decrypt, encrypt } from '@/lib/encryption';
import { getAppUrl } from '@/lib/env';
import { AppError, ValidationError } from '@/lib/errors';
import { invalidateCache, withCache } from '@/lib/cache';
import { logger } from '@/lib/logger';
import type { DbClient } from '@/lib/supabase/query';
import { generateWebhookSecret } from '@/lib/tokens';
import type {
  ConnectOwnerBotResult,
  DecryptedBinanceCredentials,
  OwnerBotStatus,
  PlatformSettings,
  PlatformSettingsRow,
  UpdatePaymentSettingsInput,
  UpdatePlatformInfoInput,
} from './types';

export type {
  ConnectOwnerBotResult,
  DecryptedBinanceCredentials,
  OwnerBotStatus,
  PlatformSettings,
  UpdatePaymentSettingsInput,
  UpdatePlatformInfoInput,
} from './types';

const OWNER_WEBHOOK_PATH = '/api/webhooks/telegram/owner';

function asRow(data: unknown): PlatformSettingsRow {
  return data as PlatformSettingsRow;
}

function asStatus(value: string | null | undefined): OwnerBotStatus {
  if (value === 'connected' || value === 'error') {
    return value;
  }
  return 'disconnected';
}

function mapRow(row: PlatformSettingsRow): PlatformSettings {
  return {
    id: row.id,
    ownerBotUsername: row.owner_bot_username,
    ownerBotId: row.owner_bot_id,
    ownerBotStatus: asStatus(row.owner_bot_status),
    ownerBotLastHealthAt: row.owner_bot_last_health_at ? new Date(row.owner_bot_last_health_at) : null,
    platformUsdtWalletBep20: row.platform_usdt_wallet_bep20,
    binancePayMerchantId: row.binance_pay_merchant_id,
    binancePayEnabled: row.binance_pay_enabled === true,
    binancePayConfigured: Boolean(row.binance_pay_api_key_encrypted && row.binance_pay_api_secret_encrypted),
    bep20Enabled: row.bep20_enabled !== false,
    platformName: row.platform_name?.trim() || 'Black Tier Circle',
    supportContact: row.support_contact,
    supportTelegram: row.support_telegram,
  };
}

function ownerWebhookUrl(): string {
  return `${getAppUrl()}${OWNER_WEBHOOK_PATH}`;
}

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

/**
 * Loads the singleton settings row, creating it when the table is empty.
 */
export async function loadPlatformSettingsRow(supabase: DbClient): Promise<PlatformSettingsRow> {
  const existing = await supabase.from('platform_settings').select('*').limit(1).maybeSingle();
  if (existing.error) {
    throw new AppError('PLATFORM_SETTINGS_LOOKUP_FAILED', existing.error.message, 500);
  }
  if (existing.data !== null) {
    return asRow(existing.data);
  }

  const inserted = await supabase
    .from('platform_settings')
    .insert({
      platform_name: 'Black Tier Circle',
      owner_bot_status: 'disconnected',
      binance_pay_enabled: false,
      bep20_enabled: true,
    })
    .select('*')
    .single();
  if (inserted.error || inserted.data === null) {
    throw new AppError(
      'PLATFORM_SETTINGS_LOOKUP_FAILED',
      inserted.error?.message ?? 'Unable to create platform settings',
      500,
    );
  }
  return asRow(inserted.data);
}

/**
 * Returns current platform settings. Encrypted fields are omitted.
 */
export async function getPlatformSettings(supabase: DbClient): Promise<PlatformSettings> {
  return withCache('platform_settings', 60_000, async () => mapRow(await loadPlatformSettingsRow(supabase)));
}

/**
 * Public webhook URL for the owner store bot.
 */
export function getOwnerBotWebhookUrl(): string {
  return ownerWebhookUrl();
}

/**
 * Validates a bot token, encrypts it, registers the owner webhook, and saves it.
 *
 * SECURITY: the plaintext token is never returned.
 */
export async function connectOwnerBot(supabase: DbClient, botToken: string): Promise<ConnectOwnerBotResult> {
  assertWebhookUrlIsPublic();
  const token = botToken.trim();
  if (token.length === 0) {
    throw new ValidationError('INVALID_BOT_TOKEN', 'Bot token is required');
  }

  const info = await telegramGetMe(token);
  if (!info.username) {
    throw new AppError('INVALID_BOT_TOKEN', 'Telegram rejected this bot token', 400);
  }

  const row = await loadPlatformSettingsRow(supabase);
  const webhookSecret = generateWebhookSecret();
  const encryptedToken = encrypt(token);
  const now = new Date().toISOString();
  const webhookUrl = ownerWebhookUrl();

  const saved = await supabase
    .from('platform_settings')
    .update({
      owner_bot_token_encrypted: encryptedToken,
      owner_bot_username: info.username,
      owner_bot_id: info.id,
      owner_bot_webhook_secret: webhookSecret,
      owner_bot_status: 'connected',
      updated_at: now,
    })
    .eq('id', row.id)
    .select('*')
    .single();
  if (saved.error || saved.data === null) {
    throw new AppError('PLATFORM_SETTINGS_UPDATE_FAILED', saved.error?.message ?? 'Unable to save owner bot', 500);
  }

  try {
    await telegramSetWebhook(token, webhookUrl, webhookSecret);
  } catch (error: unknown) {
    await supabase
      .from('platform_settings')
      .update({ owner_bot_status: 'error', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('WEBHOOK_REGISTER_FAILED', 'Unable to register Telegram webhook', 502);
  }

  invalidateCache('platform_settings');
  invalidateCache('payment_config_');
  return { username: info.username, botId: info.id, webhookUrl };
}

/**
 * Deletes the Telegram webhook and clears owner bot fields.
 */
export async function disconnectOwnerBot(supabase: DbClient): Promise<void> {
  const row = await loadPlatformSettingsRow(supabase);
  if (row.owner_bot_token_encrypted) {
    try {
      await telegramDeleteWebhook(decrypt(row.owner_bot_token_encrypted));
    } catch {
      logger.warn('failed to delete owner bot webhook');
    }
  }
  const { error } = await supabase
    .from('platform_settings')
    .update({
      owner_bot_token_encrypted: null,
      owner_bot_username: null,
      owner_bot_id: null,
      owner_bot_webhook_secret: null,
      owner_bot_status: 'disconnected',
      owner_bot_last_health_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  if (error) {
    throw new AppError('PLATFORM_SETTINGS_UPDATE_FAILED', error.message, 500);
  }
  invalidateCache('platform_settings');
  invalidateCache('payment_config_');
}

/**
 * Calls Telegram getMe for the stored owner bot and records the health check.
 */
export async function testOwnerBot(supabase: DbClient): Promise<ConnectOwnerBotResult> {
  const token = await getDecryptedOwnerBotToken(supabase);
  if (token === null) {
    throw new AppError('OWNER_BOT_NOT_CONNECTED', 'Connect the owner bot before testing it', 400);
  }
  const info = await telegramGetMe(token);
  const row = await loadPlatformSettingsRow(supabase);
  const { error } = await supabase
    .from('platform_settings')
    .update({
      owner_bot_status: 'connected',
      owner_bot_username: info.username || row.owner_bot_username,
      owner_bot_id: info.id,
      owner_bot_last_health_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  if (error) {
    throw new AppError('PLATFORM_SETTINGS_UPDATE_FAILED', error.message, 500);
  }
  return {
    username: info.username,
    botId: info.id,
    webhookUrl: ownerWebhookUrl(),
  };
}

/**
 * Updates payment settings. API key and secret are encrypted before storage.
 */
export async function updatePaymentSettings(
  supabase: DbClient,
  input: UpdatePaymentSettingsInput,
): Promise<PlatformSettings> {
  const row = await loadPlatformSettingsRow(supabase);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.platformUsdtWalletBep20 !== undefined) {
    const wallet = input.platformUsdtWalletBep20?.trim() ?? '';
    patch.platform_usdt_wallet_bep20 = wallet.length > 0 ? wallet : null;
  }
  if (input.binancePayMerchantId !== undefined) {
    const merchantId = input.binancePayMerchantId?.trim() ?? '';
    patch.binance_pay_merchant_id = merchantId.length > 0 ? merchantId : null;
  }
  if (input.binancePayApiKey !== undefined && input.binancePayApiKey.trim().length > 0) {
    patch.binance_pay_api_key_encrypted = encrypt(input.binancePayApiKey.trim());
  }
  if (input.binancePayApiSecret !== undefined && input.binancePayApiSecret.trim().length > 0) {
    patch.binance_pay_api_secret_encrypted = encrypt(input.binancePayApiSecret.trim());
  }
  if (input.binancePayEnabled !== undefined) {
    patch.binance_pay_enabled = input.binancePayEnabled;
  }
  if (input.bep20Enabled !== undefined) {
    patch.bep20_enabled = input.bep20Enabled;
  }

  const { data, error } = await supabase
    .from('platform_settings')
    .update(patch)
    .eq('id', row.id)
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('PLATFORM_SETTINGS_UPDATE_FAILED', error?.message ?? 'Unable to update payments', 500);
  }
  invalidateCache('platform_settings');
  invalidateCache('payment_config_');
  return mapRow(asRow(data));
}

/**
 * Updates public platform copy.
 */
export async function updatePlatformInfo(
  supabase: DbClient,
  input: UpdatePlatformInfoInput,
): Promise<PlatformSettings> {
  const row = await loadPlatformSettingsRow(supabase);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.platformName !== undefined) {
    patch.platform_name = input.platformName.trim();
  }
  if (input.supportContact !== undefined) {
    patch.support_contact = input.supportContact;
  }
  if (input.supportTelegram !== undefined) {
    patch.support_telegram = input.supportTelegram;
  }
  const { data, error } = await supabase
    .from('platform_settings')
    .update(patch)
    .eq('id', row.id)
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('PLATFORM_SETTINGS_UPDATE_FAILED', error?.message ?? 'Unable to update platform info', 500);
  }
  invalidateCache('platform_settings');
  invalidateCache('payment_config_');
  return mapRow(asRow(data));
}

/**
 * Server-only decrypted Binance credentials.
 * Returns null when Binance Pay is disabled or credentials are missing.
 *
 * SECURITY: never return this value to the browser.
 */
export async function getDecryptedBinanceCredentials(
  supabase: DbClient,
): Promise<DecryptedBinanceCredentials | null> {
  const row = await loadPlatformSettingsRow(supabase);
  if (row.binance_pay_enabled !== true || !row.binance_pay_api_key_encrypted || !row.binance_pay_api_secret_encrypted) {
    return null;
  }
  try {
    return {
      apiKey: decrypt(row.binance_pay_api_key_encrypted),
      apiSecret: decrypt(row.binance_pay_api_secret_encrypted),
      merchantId: row.binance_pay_merchant_id ?? '',
    };
  } catch {
    logger.error('platform binance credential decrypt failed');
    return null;
  }
}

/**
 * Server-only decrypted owner bot token.
 *
 * SECURITY: never log or return this value to the browser.
 */
export async function getDecryptedOwnerBotToken(supabase: DbClient): Promise<string | null> {
  const row = await loadPlatformSettingsRow(supabase);
  if (row.owner_bot_status !== 'connected' || !row.owner_bot_token_encrypted) {
    return null;
  }
  try {
    return decrypt(row.owner_bot_token_encrypted);
  } catch {
    logger.error('owner bot token decrypt failed');
    return null;
  }
}

/**
 * Webhook secret stored for the owner bot, or null when the bot is disconnected.
 */
export async function getOwnerBotWebhookSecret(supabase: DbClient): Promise<string | null> {
  const row = await loadPlatformSettingsRow(supabase);
  if (!row.owner_bot_webhook_secret || row.owner_bot_status !== 'connected') {
    return null;
  }
  return row.owner_bot_webhook_secret;
}
