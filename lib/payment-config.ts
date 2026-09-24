/**
 * @file lib/payment-config.ts
 *
 * Payment behavior constants. Merchant credentials and wallet addresses live in
 * platform_settings / tenant_settings and are edited from the dashboards.
 *
 * BSCSCAN_API_KEY remains an env var because it is an infrastructure key for
 * chain lookups, not a merchant credential.
 */

import { withCache } from '@/lib/cache';
import type { DbClient } from '@/lib/supabase/query';
import type { PlatformSettings } from '@/modules/platform/types';
import { resolveOrderPayments } from '@/modules/payments/resolve';

function isRealCredential(value: string | undefined): boolean {
  return !!value && !value.startsWith('PLACEHOLDER');
}

export const PAYMENT_CONFIG = {
  // ─── BINANCE PAY ─────────────────────────────────────────────────────
  binancePay: {
    /** Production Binance Pay API origin */
    baseUrl: 'https://bpay.binanceapi.com',
    /** How long a Binance Pay order stays valid before expiring */
    orderExpiryMinutes: 30,
    /** Supported currencies */
    currency: 'USDT' as const,
  },

  // ─── BEP20 / BSC ─────────────────────────────────────────────────────
  bep20: {
    get bscscanApiKey(): string {
      return process.env.BSCSCAN_API_KEY ?? '';
    },
    bscscanBaseUrl: 'https://api.bscscan.com/api',
    /** USDT BEP20 contract address on BSC mainnet — do not change */
    usdtContractAddress: '0x55d398326f99059fF775485246999027B3197955',
    /**
     * IMPORTANT: USDT on BSC has 18 decimal places (not 6).
     * Raw BSC value / 10^12 = our 6-decimal minor units.
     * Example: "10000000000000000000" (10 USDT on BSC) → 10_000_000n (our minor units)
     */
    bscDecimals: 18,
    ourDecimals: 6,
    /** How many seconds after order creation a BEP20 TX is still valid */
    txWindowSeconds: 86400, // 24 hours
  },

  // ─── VERIFICATION RULES ───────────────────────────────────────────────
  verification: {
    /** Allow slight overpayment (e.g. gas estimation rounding) — false = exact match only */
    allowOverpayment: false,
    /** Max retries before marking a pending verification as failed */
    maxVerificationRetries: 3,
    /** Seconds between auto-retry attempts */
    retryIntervalSeconds: 60,
  },

  // ─── DEMO MODE BEHAVIOR ───────────────────────────────────────────────
  // Only used when mode === 'demo'. Ignored in live mode.
  demo: {
    /** Any Binance order ID starting with this prefix → auto-succeeds in demo */
    successPrefix: 'PAY_',
    /** Any Binance order ID starting with this prefix → auto-fails in demo */
    failPrefix: 'FAIL_',
    /** Any TX hash starting with this prefix → auto-succeeds in demo */
    successTxPrefix: '0x',
    /** Any TX hash starting with this prefix → auto-fails in demo */
    failTxPrefix: '0xFAIL',
    /** Simulated verification delay in milliseconds */
    verificationDelayMs: 500,
    /** Demo wallet address shown to customers in demo mode */
    demoWalletAddress: '0xDEMO0000000000000000000000000000000000001',
  },
} as const;

/**
 * True when Binance Pay is enabled and both credentials are stored.
 */
export function isPaymentLive(
  platformSettings: Pick<PlatformSettings, 'binancePayEnabled' | 'binancePayConfigured'>,
): boolean {
  return platformSettings.binancePayEnabled && platformSettings.binancePayConfigured;
}

/**
 * True when at least one platform payment method is enabled and usable.
 */
export function isPlatformPaymentConfigured(platformSettings: PlatformSettings): boolean {
  const bep20Ready = platformSettings.bep20Enabled && Boolean(platformSettings.platformUsdtWalletBep20);
  const trc20Ready = platformSettings.trc20Enabled && Boolean(platformSettings.platformUsdtWalletTrc20);
  return isPaymentLive(platformSettings) || bep20Ready || trc20Ready;
}

/**
 * Returns a human-readable label for the current payment mode.
 * Used in admin dashboards and log prefixes.
 */
export function getPaymentModeLabel(live: boolean): string {
  return live ? '🟢 Live (Real Payments)' : '🟡 Demo Mode (No Real Payments)';
}

/**
 * True when a real BscScan key is available for on-chain verification.
 */
export function isBscScanConfigured(): boolean {
  return isRealCredential(process.env.BSCSCAN_API_KEY);
}

/**
 * Converts a BEP20 raw value string (18 decimals) to our USDT minor units (6 decimals).
 * This is the critical decimal conversion for BSC USDT.
 *
 * @param rawBscValue - The raw token value string from BscScan API (18 decimals)
 * @returns Amount in our USDT minor units (6 decimals)
 *
 * INVARIANT: rawBscValue must be a valid non-negative integer string.
 * EXAMPLE: "10000000000000000000" (10 USDT on BSC) → 10_000_000n
 */
export function bscValueToMinorUnits(rawBscValue: string): bigint {
  // BSC USDT has 18 decimals, we use 6 decimals
  // Divide by 10^(18-6) = 10^12
  const CONVERSION_FACTOR = 1_000_000_000_000n; // 10^12
  return BigInt(rawBscValue) / CONVERSION_FACTOR;
}

/**
 * Wallet shown to customers for BEP20 transfers.
 * Falls back to the demo address when no wallet is configured.
 */
export type PaymentMethodName = 'wallet' | 'binance_pay' | 'usdt_bep20' | 'usdt_trc20' | 'demo';

export type PaymentConfig = {
  readonly walletEnabled: boolean;
  readonly binancePayEnabled: boolean;
  readonly bep20Enabled: boolean;
  readonly trc20Enabled: boolean;
  readonly demoEnabled: boolean;
  readonly binancePayApiKey: null;
  readonly binancePayApiSecret: null;
  readonly binancePayMerchantId: string | null;
  readonly platformUsdtWallet: string | null;
  readonly platformUsdtTrc20Wallet: string | null;
  readonly isLiveMode: boolean;
  readonly isDemoMode: boolean;
};

/**
 * Loads which payment methods a bot may offer.
 * Credentials stay in the payment module. This result is cached for 60 seconds.
 */
export async function loadPaymentConfig(
  supabase: DbClient,
  customerBalanceMinor: bigint,
  tenantId: string | null,
): Promise<PaymentConfig> {
  const cacheKey = `payment_config_${tenantId ?? 'owner'}`;
  const resolved = await withCache(cacheKey, 60_000, () => resolveOrderPayments(supabase, tenantId));
  const hasRealPaymentMethod =
    resolved.binance !== null || resolved.bep20Address !== null || resolved.trc20Address !== null;
  return {
    walletEnabled: customerBalanceMinor > 0n,
    binancePayEnabled: resolved.binance !== null,
    bep20Enabled: resolved.bep20Address !== null,
    trc20Enabled: resolved.trc20Address !== null,
    demoEnabled: !hasRealPaymentMethod,
    binancePayApiKey: null,
    binancePayApiSecret: null,
    binancePayMerchantId: resolved.binance?.merchantId ?? null,
    platformUsdtWallet: resolved.bep20Address,
    platformUsdtTrc20Wallet: resolved.trc20Address,
    isLiveMode: hasRealPaymentMethod,
    isDemoMode: !hasRealPaymentMethod,
  };
}

export function payoutAddressFor(address: string | null | undefined): string {
  if (address && address.trim().length > 0) {
    return address.trim();
  }
  return PAYMENT_CONFIG.demo.demoWalletAddress;
}
