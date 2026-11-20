/**
 * @file modules/platform/settings-extra.ts
 *
 * Hydration and split-section persistence helpers for Owner Settings.
 * Migration 0035 columns are assumed present (applied). Migration 0036 columns
 * (bot_show_reseller_signup, bot_show_my_api) degrade safely until applied.
 */

import { normalizeEthAddress } from '@/integrations/bsc/verify';
import { AppError, ValidationError } from '@/lib/errors';
import { prepareBep20Address } from '@/lib/eth-address';
import { minorToUsdt, usdtToMinor } from '@/lib/money';
import { isProductionDemoAllowed, paymentSandboxEnabled } from '@/lib/payment-config';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { updatePaymentSettings } from '@/modules/platform';
import { loadTopupPolicy, TOPUP_DEFAULT_MAX_MINOR, TOPUP_FLOOR_MINOR } from '@/modules/topups';

function missingColumn(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return (
    error.code === '42703' ||
    error.code === '42P01' ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

function parseMinor(value: unknown, fallback: bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  return fallback;
}

export function minorToCleanUsdt(minor: bigint): string {
  const fixed = minorToUsdt(minor);
  if (!fixed.includes('.')) return fixed;
  return fixed.replace(/\.?0+$/, '') || '0';
}

export type PlatformExtraSettings = {
  readonly logoUrl: string;
  readonly confirmations: number;
  readonly expiryMinutes: number;
  readonly minUsdt: string;
  readonly maxUsdt: string;
  readonly notifications: {
    readonly failedOrder: boolean;
    readonly lowBalance: boolean;
    readonly newReseller: boolean;
    readonly largeTopup: boolean;
    readonly quietStart: string;
    readonly quietEnd: string;
  };
  readonly store: {
    readonly storeStatus: 'open' | 'maintenance';
    readonly maintenanceMessage: string;
    readonly botShowResellerSignup: boolean;
    readonly botShowMyApi: boolean;
  };
  readonly legal: {
    readonly terms: string;
    readonly refund: string;
    readonly privacy: string;
    readonly version: number;
    readonly updatedAt: string | null;
  };
};

export async function readBotMenuToggles(
  db: DbClient,
): Promise<{ readonly resellerSignup: boolean; readonly myApi: boolean }> {
  const res = (await db
    .from('platform_settings')
    .select('bot_show_reseller_signup, bot_show_my_api')
    .limit(1)
    .maybeSingle()) as QueryResult<Record<string, unknown> | null>;
  if (res.error || !res.data) {
    return { resellerSignup: false, myApi: false };
  }
  return {
    resellerSignup: res.data.bot_show_reseller_signup === true,
    myApi: res.data.bot_show_my_api === true,
  };
}

export async function saveBotMenuToggles(
  db: DbClient,
  input: { readonly resellerSignup?: boolean; readonly myApi?: boolean },
): Promise<{ readonly applied: boolean }> {
  const patch: Record<string, unknown> = {};
  if (input.resellerSignup !== undefined) patch.bot_show_reseller_signup = input.resellerSignup;
  if (input.myApi !== undefined) patch.bot_show_my_api = input.myApi;
  if (Object.keys(patch).length === 0) return { applied: true };
  const rowRes = (await db.from('platform_settings').select('id').limit(1).maybeSingle()) as QueryResult<{ id?: string } | null>;
  const id = rowRes.data?.id;
  if (!id) throw new ValidationError('PLATFORM_SETTINGS_MISSING', 'Platform settings are missing.');
  patch.updated_at = new Date().toISOString();
  const saved = await db.from('platform_settings').update(patch).eq('id', id);
  if (saved.error) {
    throw new AppError('SETTINGS_UPDATE_FAILED', saved.error.message, 500);
  }
  return { applied: true };
}

/**
 * Reads platform_settings.payment_demo_mode (added in migration 0038).
 * Returns null if the column has not been added yet, letting paymentSandboxEnabled()
 * fall back to PAYMENT_SANDBOX.
 */
export async function readPaymentDemoMode(db: DbClient): Promise<boolean | null> {
  const res = (await db
    .from('platform_settings')
    .select('payment_demo_mode')
    .limit(1)
    .maybeSingle()) as QueryResult<{ payment_demo_mode?: unknown } | null>;
  if (res.error) {
    if (missingColumn(res.error)) return null;
    throw new AppError('PLATFORM_SETTINGS_LOOKUP_FAILED', res.error.message, 500);
  }
  if (!res.data || typeof res.data.payment_demo_mode !== 'boolean') {
    return null;
  }
  return res.data.payment_demo_mode;
}

export async function savePaymentDemoMode(
  db: DbClient,
  demoMode: boolean,
): Promise<{ readonly paymentMode: 'live' | 'demo' }> {
  if (demoMode && !isProductionDemoAllowed()) {
    throw new ValidationError(
      'DEMO_BLOCKED_IN_PRODUCTION',
      'Demo mode cannot be enabled in production unless PAYMENT_DEMO_ALLOW_PROD=true is set on the server.',
    );
  }
  const rowRes = (await db.from('platform_settings').select('id').limit(1).maybeSingle()) as QueryResult<{ id?: string } | null>;
  const id = rowRes.data?.id;
  if (!id) throw new ValidationError('PLATFORM_SETTINGS_MISSING', 'Platform settings are missing.');
  const saved = await db
    .from('platform_settings')
    .update({ payment_demo_mode: demoMode, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (saved.error) {
    if (missingColumn(saved.error)) {
      throw new ValidationError(
        'PAYMENT_MODE_NEEDS_MIGRATION',
        'Apply migration 0038 before switching payment mode from Settings, or update PAYMENT_SANDBOX on the server.',
      );
    }
    throw new AppError('SETTINGS_UPDATE_FAILED', saved.error.message, 500);
  }
  return { paymentMode: paymentSandboxEnabled(demoMode) ? 'demo' : 'live' };
}

export async function readPlatformExtraSettings(db: DbClient): Promise<PlatformExtraSettings> {
  const [result, policy, toggles] = await Promise.all([
    db
      .from('platform_settings')
      .select(
        'terms_of_service, refund_policy, privacy_policy, legal_version, legal_updated_at, logo_url, bep20_confirmations, topup_expiry_minutes, min_topup_minor, max_topup_minor, alert_failed_order, alert_low_balance, alert_new_reseller, alert_large_topup, quiet_start, quiet_end, store_status, maintenance_msg',
      )
      .limit(1)
      .maybeSingle() as unknown as Promise<QueryResult<Record<string, unknown> | null>>,
    loadTopupPolicy(db),
    readBotMenuToggles(db),
  ]);
  if (result.error) {
    throw new AppError('PLATFORM_SETTINGS_LOOKUP_FAILED', result.error.message, 500);
  }
  const row = result.data ?? {};
  const minMinor = parseMinor(row.min_topup_minor, TOPUP_FLOOR_MINOR);
  const maxMinor = parseMinor(row.max_topup_minor, TOPUP_DEFAULT_MAX_MINOR);
  return {
    logoUrl: typeof row.logo_url === 'string' ? row.logo_url : '',
    confirmations: policy.confirmations,
    expiryMinutes: policy.expiryMinutes,
    minUsdt: minorToCleanUsdt(minMinor),
    maxUsdt: minorToCleanUsdt(maxMinor),
    notifications: {
      failedOrder: row.alert_failed_order !== false,
      lowBalance: row.alert_low_balance !== false,
      newReseller: row.alert_new_reseller !== false,
      largeTopup: row.alert_large_topup !== false,
      quietStart: typeof row.quiet_start === 'string' ? row.quiet_start : '',
      quietEnd: typeof row.quiet_end === 'string' ? row.quiet_end : '',
    },
    store: {
      storeStatus: row.store_status === 'maintenance' ? 'maintenance' : 'open',
      maintenanceMessage: typeof row.maintenance_msg === 'string' ? row.maintenance_msg : '',
      botShowResellerSignup: toggles.resellerSignup,
      botShowMyApi: toggles.myApi,
    },
    legal: {
      terms: typeof row.terms_of_service === 'string' ? row.terms_of_service : '',
      refund: typeof row.refund_policy === 'string' ? row.refund_policy : '',
      privacy: typeof row.privacy_policy === 'string' ? row.privacy_policy : '',
      version: typeof row.legal_version === 'number' ? row.legal_version : 1,
      updatedAt: typeof row.legal_updated_at === 'string' ? row.legal_updated_at : null,
    },
  };
}

export async function savePaymentsSection(
  db: DbClient,
  input: {
    readonly bep20Enabled: boolean;
    readonly address: string;
    readonly confirmations: number;
    readonly expiryMinutes: number;
    readonly minUsdt: string;
    readonly maxUsdt: string;
  },
): Promise<{ readonly minMinor: string; readonly maxMinor: string }> {
  const minMinor = usdtToMinor(input.minUsdt);
  const maxMinor = usdtToMinor(input.maxUsdt);
  if (minMinor <= 0n) {
    throw new ValidationError('PAYMENTS_RANGE', 'The minimum top-up must be greater than zero.');
  }
  if (maxMinor < minMinor) {
    throw new ValidationError('PAYMENTS_RANGE', 'The maximum top-up must be at least the minimum.');
  }
  const addressCheck = input.address.trim() ? prepareBep20Address(input.address) : null;

  const existingRow = (await db
    .from('platform_settings')
    .select('id, platform_usdt_wallet_bep20')
    .limit(1)
    .maybeSingle()) as QueryResult<{ id?: string; platform_usdt_wallet_bep20?: string | null } | null>;
  const id = existingRow.data?.id;
  if (!id) {
    throw new ValidationError('PLATFORM_SETTINGS_MISSING', 'Platform settings are missing.');
  }
  const existingAddress = existingRow.data?.platform_usdt_wallet_bep20 ?? null;
  const effectiveAddress = addressCheck?.address ?? existingAddress;
  if (input.bep20Enabled && (!effectiveAddress || !normalizeEthAddress(effectiveAddress))) {
    throw new ValidationError(
      'BEP20_ADDRESS_REQUIRED',
      'Save a valid BEP20 receiving address before enabling BEP20 payments.',
    );
  }

  // Group 1: core payment method & public address
  await updatePaymentSettings(db, {
    bep20Enabled: input.bep20Enabled,
    ...(addressCheck?.address ? { platformUsdtWalletBep20: addressCheck.address } : {}),
  });

  // Group 2: chain confirmations & top-up window (0035)
  const policySaved = await db
    .from('platform_settings')
    .update({
      bep20_confirmations: input.confirmations,
      topup_expiry_minutes: input.expiryMinutes,
    })
    .eq('id', id);
  if (policySaved.error) {
    throw new ValidationError('PAYMENTS_FAILED', policySaved.error.message);
  }

  // Group 3: top-up amount bounds (0029)
  const boundsSaved = await db
    .from('platform_settings')
    .update({
      min_topup_minor: minMinor.toString(),
      max_topup_minor: maxMinor.toString(),
    })
    .eq('id', id);
  if (boundsSaved.error) {
    throw new ValidationError('PAYMENTS_FAILED', boundsSaved.error.message);
  }

  return { minMinor: minMinor.toString(), maxMinor: maxMinor.toString() };
}

export async function listStoresWithOverrides(
  db: DbClient,
): Promise<readonly { readonly id: string; readonly name: string; readonly override: Record<string, boolean> | null }[]> {
  const result = (await db
    .from('tenants')
    .select('id, display_name, reseller_policy_override')
    .order('display_name')
    .limit(100)) as QueryResult<unknown>;
  if (result.error) throw new AppError('STORES_READ_FAILED', result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
  return result.data.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    if (typeof record.id !== 'string') return [];
    const rawOverride = record.reseller_policy_override;
    let override: Record<string, boolean> | null = null;
    if (rawOverride && typeof rawOverride === 'object' && !Array.isArray(rawOverride)) {
      override = {};
      for (const [k, v] of Object.entries(rawOverride as Record<string, unknown>)) {
        if (typeof v === 'boolean') override[k] = v;
      }
    }
    return [
      {
        id: record.id,
        name: typeof record.display_name === 'string' && record.display_name.trim() ? record.display_name : 'Store',
        override,
      },
    ];
  });
}
