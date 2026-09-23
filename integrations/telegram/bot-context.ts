/**
 * @file integrations/telegram/bot-context.ts
 *
 * Resolves per-bot store configuration once per webhook update.
 * Reseller settings override platform settings. Owner store uses platform settings only.
 *
 * @module Telegram
 */

import type { DbClient } from '@/lib/supabase/query';
import { getPlatformSettings } from '@/modules/platform';
import { resolveOrderPayments } from '@/modules/payments/resolve';
import { getTenantSettings } from '@/modules/tenant-settings';

export type BotContext = {
  readonly isOwnerBot: boolean;
  readonly tenantId: string | null;
  readonly storeName: string;
  readonly usdtWalletAddress: string | null;
  readonly binancePayEnabled: boolean;
  readonly bep20Enabled: boolean;
  readonly hasAnyPaymentMethod: boolean;
  readonly isDemoMode: boolean;
  readonly storeStatus: 'open' | 'maintenance';
  readonly maintenanceMessage: string;
  readonly supportContact: string | null;
  readonly supportTelegramUrl: string | null;
  readonly resellerSignupEnabled: boolean;
  readonly resellerSignupMessage: string | null;
  readonly termsOfService: string | null;
  readonly botConnectionId: string | null;
};

/**
 * Loads platform settings, then tenant settings when this update belongs to a reseller bot.
 *
 * @param supabase - Service-role client
 * @param botConnectionId - bot_connections id, or the owner-store sentinel
 * @param tenantId - Reseller tenant, or null for the owner store
 */
export async function resolveBotContext(
  supabase: DbClient,
  botConnectionId: string | null,
  tenantId: string | null,
): Promise<BotContext> {
  const platform = await getPlatformSettings(supabase);
  const tenant = tenantId ? await getTenantSettings(supabase, tenantId) : null;
  const payments = await resolveOrderPayments(supabase, tenantId);

  const storeName = tenant?.storeName?.trim() || platform.platformName || 'Black Tier Circle';

  return {
    isOwnerBot: tenantId === null,
    tenantId,
    storeName,
    usdtWalletAddress: payments.bep20Address,
    binancePayEnabled: payments.binance !== null,
    bep20Enabled: payments.bep20Address !== null,
    hasAnyPaymentMethod: !payments.demo,
    isDemoMode: payments.demo,
    storeStatus: tenant?.storeStatus ?? 'open',
    maintenanceMessage: tenant?.maintenanceMsg?.trim() || 'We will be back soon!',
    supportContact: tenant?.supportContact?.trim() || platform.supportContact,
    supportTelegramUrl: tenant?.supportChatUrl?.trim() || platform.supportTelegram,
    resellerSignupEnabled: tenant?.resellerSignupEnabled === true,
    resellerSignupMessage: tenant?.resellerSignupMessage ?? null,
    termsOfService: tenant?.termsOfService ?? null,
    botConnectionId,
  };
}
