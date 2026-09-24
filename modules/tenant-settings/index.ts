/**
 * @file modules/tenant-settings/index.ts
 *
 * Tenant settings: store status, support copy, encrypted Binance keys, markup.
 *
 * SECURITY: tenant_id always comes from the session. Binance keys are encrypted
 * with the same AES-256-GCM helper as bot tokens and never returned in plaintext.
 *
 * @module TenantSettings
 */

import { invalidateCache } from '@/lib/cache';
import { decrypt, encrypt } from '@/lib/encryption';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { DbClient } from '@/lib/supabase/query';
import type { StoreStatus, TenantSettings, TenantSettingsRow, UpdateTenantSettingsInput } from './types';

export type { StoreStatus, TenantSettings, UpdateTenantSettingsInput } from './types';

const DEFAULT_USDT_MIN = '1.000000';

function asRow(data: unknown): TenantSettingsRow {
  return data as TenantSettingsRow;
}

function asStoreStatus(value: string | null | undefined): StoreStatus {
  return value === 'maintenance' ? 'maintenance' : 'open';
}

function markupFromRow(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRow(row: TenantSettingsRow): TenantSettings {
  return {
    tenantId: row.tenant_id,
    storeName: row.store_name,
    storeStatus: asStoreStatus(row.store_status),
    maintenanceMsg: row.maintenance_msg,
    supportContact: row.support_contact,
    supportChatUrl: row.support_chat_url,
    supportPhone: row.support_phone,
    supportMessage: row.support_message,
    termsOfService: row.terms_of_service,
    refundPolicy: row.refund_policy,
    privacyPolicy: row.privacy_policy,
    binanceMerchantUid: row.binance_merchant_uid,
    binancePayConfigured: Boolean(row.binance_api_key_encrypted && row.binance_api_secret_encrypted),
    binancePayEnabled: row.binance_pay_enabled === true,
    useOwnUsdtWallet: row.use_own_usdt_wallet === true,
    usdtWalletBep20: row.usdt_wallet_bep20,
    usdtWalletTrc20: row.usdt_wallet_trc20 ?? null,
    useOwnTrc20Wallet: row.use_own_trc20_wallet === true,
    trc20Enabled: row.trc20_enabled === true,
    announcementChannelId: row.announcement_channel_id ?? null,
    usdtMinimumBep20:
      row.usdt_minimum_bep20 === null || row.usdt_minimum_bep20 === undefined
        ? DEFAULT_USDT_MIN
        : String(row.usdt_minimum_bep20),
    resellerSignupEnabled: row.reseller_signup_enabled === true,
    resellerSignupMessage: row.reseller_signup_message,
    markupPercent: markupFromRow(row.markup_percent),
    notifyOrderPlaced: row.notify_order_placed !== false,
    notifyOrderDelivered: row.notify_order_delivered !== false,
    notifyBalanceLow: row.notify_balance_low !== false,
    notifyBalanceThreshold:
      row.notify_balance_threshold === null || row.notify_balance_threshold === undefined
        ? '10'
        : String(row.notify_balance_threshold),
    notifyProductAdded: row.notify_product_added !== false,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function defaultSettings(tenantId: string): TenantSettings {
  const now = new Date();
  return {
    tenantId,
    storeName: null,
    storeStatus: 'open',
    maintenanceMsg: null,
    supportContact: null,
    supportChatUrl: null,
    supportPhone: null,
    supportMessage: null,
    termsOfService: null,
    refundPolicy: null,
    privacyPolicy: null,
    binanceMerchantUid: null,
    binancePayConfigured: false,
    binancePayEnabled: false,
    useOwnUsdtWallet: false,
    usdtWalletBep20: null,
    usdtWalletTrc20: null,
    useOwnTrc20Wallet: false,
    trc20Enabled: false,
    announcementChannelId: null,
    usdtMinimumBep20: DEFAULT_USDT_MIN,
    resellerSignupEnabled: false,
    resellerSignupMessage: null,
    markupPercent: 0,
    notifyOrderPlaced: true,
    notifyOrderDelivered: true,
    notifyBalanceLow: true,
    notifyBalanceThreshold: '10',
    notifyProductAdded: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Returns true when the bot may accept customer purchases.
 */
export function storeAllowsBotOrders(settings: Pick<TenantSettings, 'storeStatus'>): boolean {
  return settings.storeStatus === 'open';
}

/**
 * Loads tenant settings, creating a default row when none exists.
 */
export async function getTenantSettings(supabase: DbClient, tenantId: string): Promise<TenantSettings> {
  const existing = await supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (existing.error) {
    throw new AppError('TENANT_SETTINGS_LOOKUP_FAILED', existing.error.message, 500);
  }
  if (existing.data !== null) {
    return mapRow(asRow(existing.data));
  }

  const now = new Date().toISOString();
  const inserted = await supabase
    .from('tenant_settings')
    .insert({
      tenant_id: tenantId,
      store_status: 'open',
      markup_percent: 0,
      usdt_minimum_bep20: 1.0,
      reseller_signup_enabled: false,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();
  if (inserted.error || inserted.data === null) {
    return defaultSettings(tenantId);
  }
  return mapRow(asRow(inserted.data));
}

/**
 * Updates tenant settings. Encrypts Binance API credentials before storage.
 */
export async function updateTenantSettings(
  supabase: DbClient,
  tenantId: string,
  input: UpdateTenantSettingsInput,
): Promise<TenantSettings> {
  await getTenantSettings(supabase, tenantId);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.storeName !== undefined) {
    patch.store_name = input.storeName;
  }
  if (input.storeStatus !== undefined) {
    patch.store_status = input.storeStatus;
  }
  if (input.maintenanceMsg !== undefined) {
    patch.maintenance_msg = input.maintenanceMsg;
  }
  if (input.supportContact !== undefined) {
    patch.support_contact = input.supportContact;
  }
  if (input.supportChatUrl !== undefined) {
    patch.support_chat_url = input.supportChatUrl;
  }
  if (input.supportPhone !== undefined) {
    patch.support_phone = input.supportPhone;
  }
  if (input.supportMessage !== undefined) {
    patch.support_message = input.supportMessage;
  }
  if (input.termsOfService !== undefined) {
    patch.terms_of_service = input.termsOfService;
  }
  if (input.refundPolicy !== undefined) {
    patch.refund_policy = input.refundPolicy;
  }
  if (input.privacyPolicy !== undefined) {
    patch.privacy_policy = input.privacyPolicy;
  }
  if (input.binanceMerchantUid !== undefined) {
    patch.binance_merchant_uid = input.binanceMerchantUid;
  }
  if (input.binanceApiKey !== undefined && input.binanceApiKey.length > 0) {
    patch.binance_api_key_encrypted = encrypt(input.binanceApiKey);
  }
  if (input.binanceApiSecret !== undefined && input.binanceApiSecret.length > 0) {
    patch.binance_api_secret_encrypted = encrypt(input.binanceApiSecret);
  }
  if (input.binancePayEnabled !== undefined) {
    patch.binance_pay_enabled = input.binancePayEnabled;
  }
  if (input.useOwnUsdtWallet !== undefined) {
    patch.use_own_usdt_wallet = input.useOwnUsdtWallet;
  }
  if (input.usdtWalletBep20 !== undefined) {
    patch.usdt_wallet_bep20 = input.usdtWalletBep20;
  }
  if (input.usdtWalletTrc20 !== undefined) {
    patch.usdt_wallet_trc20 = input.usdtWalletTrc20;
  }
  if (input.useOwnTrc20Wallet !== undefined) {
    patch.use_own_trc20_wallet = input.useOwnTrc20Wallet;
  }
  if (input.trc20Enabled !== undefined) {
    patch.trc20_enabled = input.trc20Enabled;
  }
  if (input.announcementChannelId !== undefined) {
    patch.announcement_channel_id = input.announcementChannelId;
  }
  if (input.usdtMinimumBep20 !== undefined) {
    patch.usdt_minimum_bep20 = input.usdtMinimumBep20;
  }
  if (input.resellerSignupEnabled !== undefined) {
    patch.reseller_signup_enabled = input.resellerSignupEnabled;
  }
  if (input.resellerSignupMessage !== undefined) {
    patch.reseller_signup_message = input.resellerSignupMessage;
  }
  if (input.markupPercent !== undefined) {
    patch.markup_percent = input.markupPercent;
  }
  if (input.notifyOrderPlaced !== undefined) {
    patch.notify_order_placed = input.notifyOrderPlaced;
  }
  if (input.notifyOrderDelivered !== undefined) {
    patch.notify_order_delivered = input.notifyOrderDelivered;
  }
  if (input.notifyBalanceLow !== undefined) {
    patch.notify_balance_low = input.notifyBalanceLow;
  }
  if (input.notifyBalanceThreshold !== undefined) {
    patch.notify_balance_threshold = input.notifyBalanceThreshold;
  }
  if (input.notifyProductAdded !== undefined) {
    patch.notify_product_added = input.notifyProductAdded;
  }

  const { data, error } = await supabase
    .from('tenant_settings')
    .update(patch)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('TENANT_SETTINGS_UPDATE_FAILED', error?.message ?? 'Unable to update settings', 500);
  }
  invalidateCache('payment_config_');
  return mapRow(asRow(data));
}

export type TenantBinanceCredentials = {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly merchantId: string;
};

export type TenantPaymentSource = {
  readonly binance: TenantBinanceCredentials | null;
  readonly usdtWalletBep20: string | null;
  readonly useOwnUsdtWallet: boolean;
  readonly usdtWalletTrc20: string | null;
  readonly useOwnTrc20Wallet: boolean;
  readonly binancePayEnabled: boolean;
};

/**
 * Server-only payment credentials for a reseller.
 * SECURITY: never return this object to the browser.
 */
export async function getTenantPaymentSource(
  supabase: DbClient,
  tenantId: string,
): Promise<TenantPaymentSource> {
  const existing = await supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (existing.error) {
    throw new AppError('TENANT_SETTINGS_LOOKUP_FAILED', existing.error.message, 500);
  }
  if (existing.data === null) {
    return {
      binance: null,
      usdtWalletBep20: null,
      useOwnUsdtWallet: false,
      usdtWalletTrc20: null,
      useOwnTrc20Wallet: false,
      binancePayEnabled: false,
    };
  }
  const row = asRow(existing.data);
  const enabled = row.binance_pay_enabled === true;
  let binance: TenantBinanceCredentials | null = null;
  if (enabled && row.binance_api_key_encrypted && row.binance_api_secret_encrypted) {
    try {
      binance = {
        apiKey: decrypt(row.binance_api_key_encrypted),
        apiSecret: decrypt(row.binance_api_secret_encrypted),
        merchantId: row.binance_merchant_uid ?? '',
      };
    } catch {
      logger.error('tenant binance credential decrypt failed', { tenantId });
    }
  }
  const wallet = row.usdt_wallet_bep20?.trim() ?? '';
  const trc20 = row.usdt_wallet_trc20?.trim() ?? '';
  return {
    binance,
    usdtWalletBep20: wallet.length > 0 ? wallet : null,
    useOwnUsdtWallet: row.use_own_usdt_wallet === true,
    usdtWalletTrc20: trc20.length > 0 ? trc20 : null,
    useOwnTrc20Wallet: row.use_own_trc20_wallet === true && row.trc20_enabled !== false,
    binancePayEnabled: enabled,
  };
}
