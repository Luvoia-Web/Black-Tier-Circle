/**
 * @file integrations/telegram/bot-context.ts
 *
 * Resolves per-bot store configuration once per webhook update.
 * Reseller settings override platform settings. Owner store uses platform settings only.
 *
 * @module Telegram
 */

import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getPlatformSettings } from '@/modules/platform';
import { readBotMenuToggles } from '@/modules/platform/settings-extra';
import { resolveCryptoPayee, resolveOrderPayments } from '@/modules/payments/resolve';
import { getTenantSettings } from '@/modules/tenant-settings';
import { getStoreConfig } from '@/modules/store-config';
import type { StoredStoreConfig } from '@/modules/store-config/types';
import { loadTopupLimits } from '@/modules/topups';

export type BotContext = {
  readonly isOwnerBot: boolean;
  readonly tenantId: string | null;
  readonly storeName: string;
  readonly usdtWalletAddress: string | null;
  /** Set when crypto top-ups are hidden. Null when crypto can be offered. */
  readonly cryptoNotice: string | null;
  readonly trc20WalletAddress: string | null;
  readonly binancePayEnabled: boolean;
  readonly bep20Enabled: boolean;
  readonly trc20Enabled: boolean;
  readonly announcementChannelId: string | null;
  readonly hasAnyPaymentMethod: boolean;
  readonly isDemoMode: boolean;
  readonly storeStatus: 'open' | 'maintenance';
  readonly maintenanceMessage: string;
  readonly supportContact: string | null;
  readonly supportTelegramUrl: string | null;
  readonly resellerSignupEnabled: boolean;
  readonly resellerSignupMessage: string | null;
  readonly myApiEnabled: boolean;
  readonly termsOfService: string | null;
  readonly botConnectionId: string | null;
  readonly binanceMerchantId: string | null;
  /** Smallest wallet top-up, in USDT minor units. Never below 1.00 USDT. */
  readonly minimumDepositMinor: bigint;
  /** Largest wallet top-up, in USDT minor units. */
  readonly maximumDepositMinor: bigint;
  /** Null when the owner has not saved Bot Studio yet. */
  readonly studio: StoredStoreConfig | null;
};

/**
 * Loads platform settings, then tenant settings when this update belongs to a reseller bot.
 *
 * @param supabase - Service-role client
 * @param botConnectionId - bot_connections id, or the owner-store sentinel
 * @param tenantId - Reseller tenant, or null for the owner store
 */
const CONTEXT_CACHE = new Map<string, { data: BotContext; expiresAt: number }>();

async function platformStoreGate(supabase: DbClient): Promise<{ readonly status: 'open' | 'maintenance'; readonly message: string }> {
  const result = (await supabase.from('platform_settings').select('store_status, maintenance_msg').limit(1).maybeSingle()) as QueryResult<unknown>;
  if (result.error || !result.data || typeof result.data !== 'object') {
    return { status: 'open', message: '' };
  }
  const row = result.data as Record<string, unknown>;
  const message = typeof row.maintenance_msg === 'string' ? row.maintenance_msg : '';
  return { status: row.store_status === 'maintenance' ? 'maintenance' : 'open', message };
}

/**
 * Returns store settings, reusing a 30 second cache per bot.
 * The cache lives in one serverless instance, so a shorter TTL is the safe way
 * for a dashboard save to show up without a shared cache flush.
 */
export async function resolveBotContextCached(
  supabase: DbClient,
  botConnectionId: string | null,
  tenantId: string | null,
): Promise<BotContext> {
  const key = `${botConnectionId ?? 'none'}:${tenantId ?? 'owner'}`;
  const hit = CONTEXT_CACHE.get(key);
  if (hit && Date.now() <= hit.expiresAt) {
    return hit.data;
  }
  const data = await resolveBotContext(supabase, botConnectionId, tenantId);
  CONTEXT_CACHE.set(key, { data, expiresAt: Date.now() + 30_000 });
  return data;
}

export async function resolveBotContext(
  supabase: DbClient,
  botConnectionId: string | null,
  tenantId: string | null,
): Promise<BotContext> {
  const [platform, tenant, payments, crypto, studio, gate, menuToggles, limits, termsOfService] = await Promise.all([
    getPlatformSettings(supabase),
    tenantId ? getTenantSettings(supabase, tenantId) : Promise.resolve(null),
    resolveOrderPayments(supabase, tenantId),
    resolveCryptoPayee(supabase, tenantId),
    getStoreConfig(supabase, tenantId),
    tenantId ? Promise.resolve(null) : platformStoreGate(supabase),
    readBotMenuToggles(supabase),
    loadTopupLimits(supabase, tenantId),
    platformLegalText(supabase),
  ]);

  const storeName = tenant?.storeName?.trim() || platform.platformName || 'Black Tier Circle';
  const resellerSignupEnabled = tenantId
    ? menuToggles.resellerSignup && tenant?.resellerSignupEnabled === true
    : menuToggles.resellerSignup;

  return {
    isOwnerBot: tenantId === null,
    tenantId,
    storeName,
    usdtWalletAddress: crypto.address,
    cryptoNotice: crypto.notice,
    trc20WalletAddress: payments.trc20Address,
    binancePayEnabled: payments.binance !== null,
    bep20Enabled: crypto.enabled,
    trc20Enabled: payments.trc20Address !== null,
    announcementChannelId: tenant?.announcementChannelId ?? null,
    hasAnyPaymentMethod: !payments.demo,
    isDemoMode: payments.demo,
    storeStatus: tenant?.storeStatus ?? gate?.status ?? 'open',
    maintenanceMessage: tenant?.maintenanceMsg?.trim() || gate?.message || 'We will be back soon!',
    supportContact: tenant?.supportContact?.trim() || platform.supportContact,
    supportTelegramUrl: tenant?.supportChatUrl?.trim() || platform.supportTelegram,
    resellerSignupEnabled,
    resellerSignupMessage: tenant?.resellerSignupMessage ?? null,
    myApiEnabled: menuToggles.myApi,
    termsOfService,
    botConnectionId,
    binanceMerchantId: payments.binance?.merchantId.trim() || null,
    minimumDepositMinor: limits.min,
    maximumDepositMinor: limits.max,
    studio: studio.source === 'stored' ? studio : null,
  };
}

/**
 * Terms, refund policy, and privacy policy are platform-wide.
 * A reseller store cannot replace or hide them.
 */
async function platformLegalText(db: DbClient): Promise<string | null> {
  const result = (await db.from('platform_settings').select('terms_of_service, refund_policy, privacy_policy').limit(1).maybeSingle()) as QueryResult<unknown>;
  if (result.error || !result.data || typeof result.data !== 'object') return null;
  const row = result.data as Record<string, unknown>;
  const part = (label: string, value: unknown): string => (typeof value === 'string' && value.trim() ? `${label}\n${value.trim()}` : '');
  const text = [part('Terms', row.terms_of_service), part('Refund policy', row.refund_policy), part('Privacy policy', row.privacy_policy)].filter(Boolean).join('\n\n');
  return text.length > 0 ? text : null;
}
