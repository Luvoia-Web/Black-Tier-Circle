/**
 * @file lib/payment-config.ts
 *
 * SINGLE SOURCE OF TRUTH for all payment configuration.
 *
 * To switch from demo to production:
 * 1. Add real BINANCE_PAY_API_KEY, BINANCE_PAY_API_SECRET, BINANCE_PAY_MERCHANT_ID to .env
 * 2. Add real BSCSCAN_API_KEY and PLATFORM_USDT_WALLET_ADDRESS to .env
 * 3. Restart the server
 * 4. Zero code changes required — everything reads from here
 *
 * To customize any payment behavior, change values in this file only.
 * Never hardcode payment amounts, timeouts, or addresses anywhere else.
 */

function isRealCredential(value: string | undefined): boolean {
  return !!value && !value.startsWith('PLACEHOLDER');
}

export const PAYMENT_CONFIG = {
  // ─── MODE ────────────────────────────────────────────────────────────
  // Auto-detected from env vars. Never set this manually.
  // 'demo' = sandbox adapters, 'live' = real APIs
  get mode(): 'demo' | 'live' {
    const hasRealBinance = isRealCredential(process.env.BINANCE_PAY_API_KEY);
    const hasRealBsc = isRealCredential(process.env.BSCSCAN_API_KEY);
    return hasRealBinance && hasRealBsc ? 'live' : 'demo';
  },

  // ─── BINANCE PAY ─────────────────────────────────────────────────────
  binancePay: {
    get apiKey(): string {
      return process.env.BINANCE_PAY_API_KEY ?? '';
    },
    get apiSecret(): string {
      return process.env.BINANCE_PAY_API_SECRET ?? '';
    },
    get merchantId(): string {
      return process.env.BINANCE_PAY_MERCHANT_ID ?? '';
    },
    /** Base URL — swap for sandbox URL during Binance merchant testing */
    get baseUrl(): string {
      return process.env.BINANCE_PAY_BASE_URL ?? 'https://bpay.binanceapi.com';
    },
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
    /** Platform USDT wallet — where customers send funds */
    get platformWalletAddress(): string {
      return process.env.PLATFORM_USDT_WALLET_ADDRESS ?? '';
    },
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
 * Returns a human-readable label for the current payment mode.
 * Used in admin dashboards and log prefixes.
 */
export function getPaymentModeLabel(): string {
  return PAYMENT_CONFIG.mode === 'live'
    ? '🟢 Live (Real Payments)'
    : '🟡 Demo Mode (No Real Payments)';
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
 * Platform wallet shown to customers for BEP20 transfers.
 */
export function getBep20PayoutAddress(): string {
  if (PAYMENT_CONFIG.mode === 'live' && PAYMENT_CONFIG.bep20.platformWalletAddress) {
    return PAYMENT_CONFIG.bep20.platformWalletAddress;
  }
  return PAYMENT_CONFIG.demo.demoWalletAddress;
}
