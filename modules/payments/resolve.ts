/**
 * @file modules/payments/resolve.ts
 *
 * Chooses Binance credentials and the BEP20 wallet for an order.
 *
 * Priority:
 * 1. Reseller Binance Pay (when enabled and configured)
 * 2. Platform Binance Pay (when enabled and configured)
 * 3. Reseller USDT wallet (when "use own wallet" is on)
 * 4. Platform USDT wallet (when BEP20 is enabled)
 * 5. Demo mode when nothing is configured
 *
 * @module Payments
 */

import { getDecryptedBinanceCredentials, getPlatformSettings } from '@/modules/platform';
import type { DecryptedBinanceCredentials } from '@/modules/platform';
import { getTenantPaymentSource } from '@/modules/tenant-settings';
import type { DbClient } from '@/lib/supabase/query';

export type ResolvedPayments = {
  readonly demo: boolean;
  readonly binance: DecryptedBinanceCredentials | null;
  readonly bep20Address: string | null;
};

/**
 * Resolves the payment source for an owner-store order (tenantId null) or a reseller order.
 */
export async function resolveOrderPayments(
  supabase: DbClient,
  tenantId: string | null,
): Promise<ResolvedPayments> {
  const platform = await getPlatformSettings(supabase);
  const platformBinance = await getDecryptedBinanceCredentials(supabase);

  let resellerBinance: DecryptedBinanceCredentials | null = null;
  let resellerWallet: string | null = null;
  if (tenantId) {
    const tenant = await getTenantPaymentSource(supabase, tenantId);
    if (tenant.binancePayEnabled && tenant.binance) {
      resellerBinance = tenant.binance;
    }
    if (tenant.useOwnUsdtWallet && tenant.usdtWalletBep20) {
      resellerWallet = tenant.usdtWalletBep20;
    }
  }

  const binance = resellerBinance ?? platformBinance;
  const platformWallet =
    platform.bep20Enabled && platform.platformUsdtWalletBep20 ? platform.platformUsdtWalletBep20 : null;
  const bep20Address = resellerWallet ?? platformWallet;

  return {
    demo: binance === null && bep20Address === null,
    binance,
    bep20Address,
  };
}
