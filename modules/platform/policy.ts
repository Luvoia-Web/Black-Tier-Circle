/**
 * platform_settings.reseller_policy.
 * A missing key allows the field, so existing resellers keep working until the owner locks one.
 * A missing column is reported as needs migration 0032 and does not block writes.
 */

import { ValidationError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';

export const RESELLER_POLICY_FIELDS = [
  { key: 'storeName', label: 'Store name' },
  { key: 'storeStatus', label: 'Open or maintenance' },
  { key: 'maintenanceMsg', label: 'Maintenance message' },
  { key: 'supportContact', label: 'Support contact' },
  { key: 'supportChatUrl', label: 'Support chat link' },
  { key: 'supportPhone', label: 'Support phone' },
  { key: 'supportMessage', label: 'Support message' },
  { key: 'termsOfService', label: 'Terms' },
  { key: 'refundPolicy', label: 'Refund policy' },
  { key: 'privacyPolicy', label: 'Privacy policy' },
  { key: 'binancePayEnabled', label: 'Binance Pay' },
  { key: 'binanceMerchantUid', label: 'Binance merchant id' },
  { key: 'binanceApiKey', label: 'Binance API key' },
  { key: 'binanceApiSecret', label: 'Binance API secret' },
  { key: 'useOwnUsdtWallet', label: 'Own BEP20 wallet' },
  { key: 'usdtWalletBep20', label: 'BEP20 address' },
  { key: 'useOwnTrc20Wallet', label: 'Own TRC20 wallet' },
  { key: 'usdtWalletTrc20', label: 'TRC20 address' },
  { key: 'trc20Enabled', label: 'TRC20 payments' },
  { key: 'usdtMinimumBep20', label: 'Minimum deposit' },
  { key: 'markupPercent', label: 'Markup' },
  { key: 'catalogPrice', label: 'Listing price' },
  { key: 'botCopy', label: 'Bot text and buttons' },
  { key: 'announcementChannelId', label: 'Announcement channel' },
  { key: 'apiKeys', label: 'API keys' },
  { key: 'webhooks', label: 'Webhooks' },
] as const;

export type ResellerPolicyKey = (typeof RESELLER_POLICY_FIELDS)[number]['key'];

const KEYS = new Set<string>(RESELLER_POLICY_FIELDS.map((field) => field.key));

function missingColumn(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return error.code === '42703' || error.code === '42P01' || message.includes('does not exist') || message.includes('schema cache');
}

function labelFor(key: string): string {
  return RESELLER_POLICY_FIELDS.find((field) => field.key === key)?.label ?? key;
}

export function policyAllows(policy: Record<string, unknown>, key: string): boolean {
  return policy[key] !== false;
}

export async function readResellerPolicy(db: DbClient): Promise<{ readonly policy: Record<string, boolean>; readonly needsMigration: boolean }> {
  const result = (await db.from('platform_settings').select('id, reseller_policy').limit(1).maybeSingle()) as QueryResult<unknown>;
  if (missingColumn(result.error)) {
    return { policy: {}, needsMigration: true };
  }
  const row = result.data && typeof result.data === 'object' ? (result.data as Record<string, unknown>) : null;
  if (!row || row.reseller_policy === undefined) {
    return { policy: {}, needsMigration: true };
  }
  const raw = row.reseller_policy;
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const policy: Record<string, boolean> = {};
  for (const field of RESELLER_POLICY_FIELDS) {
    policy[field.key] = source[field.key] !== false;
  }
  return { policy, needsMigration: false };
}

/**
 * Rejects a reseller write that touches a locked field. Nothing is saved.
 */
export async function assertResellerFieldsAllowed(db: DbClient, fields: readonly string[]): Promise<void> {
  const touched = fields.filter((field) => KEYS.has(field));
  if (touched.length === 0) return;
  const loaded = await readResellerPolicy(db);
  if (loaded.needsMigration) return;
  const blocked = touched.filter((field) => loaded.policy[field] === false);
  if (blocked.length === 0) return;
  const labels = blocked.map(labelFor).join(', ');
  throw new ValidationError(
    'RESELLER_POLICY_BLOCKED',
    `The platform owner has locked ${labels}. The saved value was kept.`,
  );
}

export async function saveResellerPolicy(db: DbClient, input: Record<string, unknown>): Promise<{ readonly needsMigration: boolean }> {
  const policy: Record<string, boolean> = {};
  for (const field of RESELLER_POLICY_FIELDS) {
    if (input[field.key] !== undefined && typeof input[field.key] !== 'boolean') {
      throw new ValidationError('RESELLER_POLICY_INVALID', `${field.label} must be allowed or locked.`);
    }
    policy[field.key] = input[field.key] !== false;
  }
  const current = (await db.from('platform_settings').select('id').limit(1).maybeSingle()) as QueryResult<unknown>;
  const row = current.data && typeof current.data === 'object' ? (current.data as Record<string, unknown>) : null;
  const id = typeof row?.id === 'string' ? row.id : '';
  if (!id) {
    throw new ValidationError('PLATFORM_SETTINGS_MISSING', 'Platform settings are missing, so the reseller policy cannot be saved.');
  }
  const saved = await db.from('platform_settings').update({ reseller_policy: policy }).eq('id', id);
  const result = saved as QueryResult<unknown>;
  if (missingColumn(result.error)) return { needsMigration: true };
  if (result.error) throw new ValidationError('RESELLER_POLICY_FAILED', result.error.message);
  return { needsMigration: false };
}
