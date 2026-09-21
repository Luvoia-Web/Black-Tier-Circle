/**
 * @file lib/supplier-config.ts
 *
 * Supplier connector configuration — single source of truth.
 * Adding a new supplier: implement SupplierConnector interface + add config here.
 * Switching supplier: change ACTIVE_SUPPLIER env var. Zero code changes.
 *
 * To activate a real supplier:
 * Set SUPPLIER_1_API_KEY, SUPPLIER_1_BASE_URL etc. in .env
 * Set ACTIVE_SUPPLIER=supplier_1 in .env
 * Restart. Done.
 */

export const SUPPLIER_CONFIG = {
  /**
   * Which supplier to use. Reads from ACTIVE_SUPPLIER env var.
   * 'sandbox' = demo mode, no real supplier calls
   * 'supplier_1' = first real supplier (configured below)
   */
  get activeSupplier(): 'sandbox' | 'supplier_1' {
    const val = process.env.ACTIVE_SUPPLIER;
    if (
      val === 'supplier_1' &&
      process.env.SUPPLIER_1_API_KEY &&
      !process.env.SUPPLIER_1_API_KEY.startsWith('PLACEHOLDER')
    ) {
      return 'supplier_1';
    }
    return 'sandbox';
  },

  /** Sandbox behavior */
  sandbox: {
    /** Simulated fulfillment delay in ms (0 under Vitest so unit tests stay fast) */
    get fulfillmentDelayMs(): number {
      return process.env.NODE_ENV === 'test' ? 0 : 1000;
    },
    /** Prefix for orders that auto-succeed in sandbox */
    successPrefix: 'TEST_',
    /** Prefix for orders that auto-fail in sandbox */
    failPrefix: 'FAIL_',
    /** Prefix for orders that return outcome_unknown in sandbox */
    unknownPrefix: 'UNKNOWN_',
  },

  /** Supplier 1 — your first real supplier */
  supplier_1: {
    get baseUrl(): string {
      return process.env.SUPPLIER_1_BASE_URL ?? '';
    },
    get apiKey(): string {
      return process.env.SUPPLIER_1_API_KEY ?? '';
    },
    /** Request timeout in ms */
    timeoutMs: 30_000,
    /** Max retries on network error (not on business error) */
    maxRetries: 3,
    /** Delay between retries in ms */
    retryDelayMs: 2_000,
    /** Reconciliation: how often to poll outcome_unknown orders (minutes) */
    reconciliationIntervalMinutes: 15,
    /** How long before an outcome_unknown order is escalated to owner (hours) */
    escalationHours: 2,
  },

  /** General supplier settings */
  general: {
    /** Products with delivery_type='supplier_api' route here */
    deliveryType: 'supplier_api' as const,
    /** Max time to wait for supplier response before outcome_unknown */
    responseTimeoutMs: 30_000,
  },
};

/** Returns true if a real supplier is configured and active */
export function hasActiveSupplier(): boolean {
  return SUPPLIER_CONFIG.activeSupplier !== 'sandbox';
}

/** Returns mode label for dashboards */
export function getSupplierModeLabel(): string {
  return SUPPLIER_CONFIG.activeSupplier === 'sandbox'
    ? '🟡 Supplier Demo Mode'
    : `🟢 Supplier Live (${SUPPLIER_CONFIG.activeSupplier})`;
}
