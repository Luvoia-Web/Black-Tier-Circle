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

import { normalizeEthAddress } from '@/integrations/bsc/verify';
import { getDecryptedBinanceCredentials, getPlatformSettings } from '@/modules/platform';
import type { DecryptedBinanceCredentials } from '@/modules/platform';
import { getTenantPaymentSource } from '@/modules/tenant-settings';
import type { DbClient } from '@/lib/supabase/query';

export const RESELLER_CRYPTO_DISABLED =
  'Crypto payments are not enabled for this store. Turn on “Use my own USDT wallet” and save your own BEP20 address in payment settings.';

export type ResolvedPayments = {
  readonly demo: boolean;
  readonly binance: DecryptedBinanceCredentials | null;
  readonly bep20Address: string | null;
  readonly trc20Address: string | null;
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
  let resellerTrc20: string | null = null;
  if (tenantId) {
    const tenant = await getTenantPaymentSource(supabase, tenantId);
    if (tenant.binancePayEnabled && tenant.binance) {
      resellerBinance = tenant.binance;
    }
    if (tenant.useOwnUsdtWallet && tenant.usdtWalletBep20) {
      resellerWallet = tenant.usdtWalletBep20;
    }
    if (tenant.useOwnTrc20Wallet && tenant.usdtWalletTrc20) {
      resellerTrc20 = tenant.usdtWalletTrc20;
    }
  }

  const binance = resellerBinance ?? platformBinance;
  const platformWallet =
    platform.bep20Enabled && platform.platformUsdtWalletBep20 ? platform.platformUsdtWalletBep20 : null;
  const bep20Address = resellerWallet ?? platformWallet;
  const platformTrc20 =
    platform.trc20Enabled && platform.platformUsdtWalletTrc20 ? platform.platformUsdtWalletTrc20 : null;
  const trc20Address = resellerTrc20 ?? platformTrc20;

  return {
    demo: binance === null && bep20Address === null && trc20Address === null,
    binance,
    bep20Address,
    trc20Address,
  };
}

export type CryptoPayee = {
  readonly enabled: boolean;
  readonly address: string | null;
  readonly notice: string | null;
};

/**
 * Address a crypto top-up may use.
 * The owner bot uses the owner address. A reseller bot uses only that reseller’s
 * own address. It does not fall back to the owner, so reseller buyers cannot
 * be told to pay the owner while their credit stays on the reseller store.
 */
export async function resolveCryptoPayee(supabase: DbClient, tenantId: string | null): Promise<CryptoPayee> {
  if (tenantId === null) {
    const platform = await getPlatformSettings(supabase);
    const address =
      platform.bep20Enabled && platform.platformUsdtWalletBep20
        ? normalizeEthAddress(platform.platformUsdtWalletBep20)
        : null;
    if (!address) {
      return {
        enabled: false,
        address: null,
        notice: 'Save a valid BEP20 address in owner payment settings before buyers can top up with crypto.',
      };
    }
    return { enabled: true, address, notice: null };
  }
  const tenant = await getTenantPaymentSource(supabase, tenantId);
  const own = tenant.useOwnUsdtWallet ? normalizeEthAddress(tenant.usdtWalletBep20 ?? '') : null;
  if (!own) {
    return { enabled: false, address: null, notice: RESELLER_CRYPTO_DISABLED };
  }
  return { enabled: true, address: own, notice: null };
}
