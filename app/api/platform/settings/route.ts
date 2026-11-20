/**
 * Settings. Each section saves on its own. The tenant comes from the session.
 * Secret values are never returned.
 */

import { z } from 'zod';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { AppError, AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { loadFraudThresholds } from '@/modules/platform/fraud';
import { getPlatformSettings, updatePlatformInfo } from '@/modules/platform';
import { readEffectiveResellerPolicy, RESELLER_POLICY_FIELDS, saveResellerPolicy } from '@/modules/platform/policy';
import { readRevenueGoal, writeRevenueGoal, parseGoalUsdt } from '@/modules/platform/goal';
import { normalizeEthAddress } from '@/integrations/bsc/verify';
import { isProductionDemoAllowed, paymentSandboxEnabled } from '@/lib/payment-config';
import {
  listStoresWithOverrides,
  readPaymentDemoMode,
  readPlatformExtraSettings,
  saveBotMenuToggles,
  savePaymentDemoMode,
  savePaymentsSection,
} from '@/modules/platform/settings-extra';
import { saveOwnerStoreStatus } from '@/modules/platform/store';
import { getTenantByUserId } from '@/modules/tenants';
import type { DbClient, QueryResult } from '@/lib/supabase/query';

export const dynamic = 'force-dynamic';

const PolicyBody = z.object({
  section: z.literal('policy'),
  policy: z.record(z.boolean()),
});

const BusinessBody = z.object({
  section: z.literal('business'),
  platformName: z.string().trim().min(1).max(80),
  supportContact: z.string().trim().max(120),
  timezone: z.string().trim().min(1).max(64),
  logoUrl: z.string().trim().max(300).optional().default(''),
});

const LegalBody = z.object({
  section: z.literal('legal'),
  terms: z.string().max(20000),
  refund: z.string().max(20000),
  privacy: z.string().max(20000),
});

const FraudBody = z.object({
  section: z.literal('fraud'),
  ordersPerHour: z.number().int().positive().max(10000),
  ordersPerDay: z.number().int().positive().max(100000),
  failedClaimsPerHour: z.number().int().positive().max(10000),
  supportMessagesPerHour: z.number().int().positive().max(10000),
  referralClaimsPerDay: z.number().int().positive().max(10000),
  freebieClaimsPerDay: z.number().int().positive().max(10000),
  discountRedemptionsPerCustomer: z.number().int().positive().max(10000),
  newAccountOrderCap: z.number().int().positive().max(1000),
  newAccountAgeHours: z.number().int().positive().max(8760),
});

const QUIET_TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

const PaymentsBody = z.object({
  section: z.literal('payments'),
  bep20Enabled: z.boolean(),
  address: z.string().trim().max(80).optional().default(''),
  confirmations: z.number().int().positive().max(100),
  minUsdt: z.union([z.number(), z.string()]).transform((value) => String(value).trim()),
  maxUsdt: z.union([z.number(), z.string()]).transform((value) => String(value).trim()),
  expiryMinutes: z.number().int().positive().max(10080),
});

const StoreBody = z.object({
  section: z.literal('store'),
  storeStatus: z.enum(['open', 'maintenance']),
  maintenanceMessage: z.string().max(500),
  goalUsdt: z.string().trim().max(20).optional(),
  botShowResellerSignup: z.boolean().optional(),
  botShowMyApi: z.boolean().optional(),
});

const NotifyBody = z.object({
  section: z.literal('notifications'),
  failedOrder: z.boolean(),
  lowBalance: z.boolean(),
  newReseller: z.boolean(),
  largeTopup: z.boolean(),
  quietStart: z.string().regex(QUIET_TIME, 'Use HH:MM in 24-hour time.').or(z.literal('')),
  quietEnd: z.string().regex(QUIET_TIME, 'Use HH:MM in 24-hour time.').or(z.literal('')),
});

const OverrideBody = z.object({
  section: z.literal('override'),
  tenantId: z.string().uuid(),
  policy: z.record(z.boolean()).nullable(),
});

const PaymentModeBody = z.object({
  section: z.literal('payment_mode'),
  mode: z.enum(['live', 'demo']),
  reason: z.string().trim().min(3, 'Enter a short reason for changing payment mode.').max(200).optional().default('Owner switched payment mode'),
});

const Body = z.discriminatedUnion('section', [PolicyBody, BusinessBody, LegalBody, FraudBody, PaymentsBody, PaymentModeBody, StoreBody, NotifyBody, OverrideBody]);

function maskAddress(value: string | null): string {
  if (!value) return '';
  if (value.length < 12) return 'Saved';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

async function scope() {
  const session = await requireUser();
  const role = session.profile.role;
  if (role !== 'owner' && role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to settings', 403);
  }
  const db = asDbClient(session.admin);
  const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
  return {
    db,
    role,
    userId: session.user.id,
    email: session.user.email ?? '',
    tenantId: tenant?.id ?? null,
    tenantName: tenant?.displayName ?? null,
    displayName: session.profile.displayName,
    timezone: session.profile.timezone,
  };
}

async function audit(db: DbClient, actorId: string, action: string, tenantId: string | null): Promise<void> {
  await db.from('audit_log').insert({
    actor_id: actorId,
    tenant_id: tenantId,
    action,
    target_type: 'settings',
    target_id: action,
    reason: 'settings save',
  });
}

export async function GET(): Promise<Response> {
  try {
    const current = await scope();
    const policy = await readEffectiveResellerPolicy(current.db, current.tenantId);
    const fraud = await loadFraudThresholds(current.db);
    const platform = current.role === 'owner' ? await getPlatformSettings(current.db) : null;
    const goal = await readRevenueGoal(current.db, { role: current.role, tenantId: current.tenantId });
    const extra = current.role === 'owner' ? await readPlatformExtraSettings(current.db) : null;
    const dbDemoMode = current.role === 'owner' ? await readPaymentDemoMode(current.db) : null;
    const stores = current.role === 'owner' ? await listStoresWithOverrides(current.db) : [];
    return jsonSuccess({
      role: current.role,
      displayName: current.displayName,
      email: current.email,
      timezone: current.timezone,
      tenantName: current.tenantName,
      needsMigration: false,
      fields: RESELLER_POLICY_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        help: field.help,
        allowed: policy.policy[field.key] !== false,
      })),
      fraud: fraud.thresholds,
      business: platform
        ? { platformName: platform.platformName, supportContact: platform.supportContact ?? '', logoUrl: extra?.logoUrl ?? '' }
        : null,
      legal: extra?.legal ?? null,
      payments: platform && extra
        ? {
            bep20Enabled: platform.bep20Enabled,
            hasSavedAddress: Boolean(platform.platformUsdtWalletBep20 && normalizeEthAddress(platform.platformUsdtWalletBep20)),
            addressMasked: maskAddress(platform.platformUsdtWalletBep20),
            confirmations: extra.confirmations,
            expiryMinutes: extra.expiryMinutes,
            minUsdt: extra.minUsdt,
            maxUsdt: extra.maxUsdt,
            paymentMode: paymentSandboxEnabled(dbDemoMode) ? 'demo' : 'live',
            demoAllowed: isProductionDemoAllowed(),
          }
        : null,
      notifications: extra?.notifications ?? null,
      store: extra?.store ?? null,
      goal,
      stores,
      integrations: current.role === 'owner' ? integrationStatus() : null,
      audit: current.role === 'owner' ? await recentAudit(current.db) : [],
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

function integrationStatus(): { readonly suppliers: string; readonly groq: string; readonly hindsight: string } {
  return {
    suppliers: 'Read from the supplier desk. Keys stay on the server.',
    groq: process.env.GROQ_API_KEY ? 'Configured' : 'Not configured',
    hindsight: process.env.HINDSIGHT_API_KEY && (process.env.HINDSIGHT_API_URL || process.env.HINDSIGHT_BASE_URL) ? 'Configured' : 'Not configured',
  };
}

async function recentAudit(db: DbClient): Promise<readonly { readonly id: string; readonly action: string; readonly at: string }[]> {
  const result = (await db.from('audit_log').select('id, action, created_at').order('created_at', { ascending: false }).limit(12)) as QueryResult<unknown>;
  if (result.error) throw new AppError('AUDIT_READ_FAILED', result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
  return result.data.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.action !== 'string' || typeof record.created_at !== 'string') return [];
    return [{ id: record.id, action: record.action, at: record.created_at }];
  });
}

export async function POST(): Promise<Response> {
  try {
    const session = await requireUser();
    if (session.profile.role !== 'owner' && session.profile.role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You cannot sign out other sessions', 403);
    }
    await assertRateLimit(`settings-signout:${session.user.id}`, 5);
    const { data } = await session.supabase.auth.getSession();
    const jwt = data.session?.access_token;
    if (!jwt) throw new AuthError('SESSION_REQUIRED', 'Sign in again before ending other sessions', 401);
    const signedOut = await session.admin.auth.admin.signOut(jwt, 'others');
    if (signedOut.error) throw new AuthError('SIGNOUT_FAILED', 'Other sessions could not be ended', 500);
    await asDbClient(session.admin).from('audit_log').insert({
      actor_id: session.user.id,
      action: 'settings.signout_others',
      target_type: 'session',
      target_id: session.user.id,
      reason: 'sign out other sessions',
    });
    return jsonSuccess({ ok: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const current = await scope();
    await assertRateLimit(`settings:${current.userId}`, 30);
    const body = Body.parse(await readJsonBody(request));
    if (current.role !== 'owner' && body.section !== 'store') {
      throw new AuthError('FORBIDDEN', 'Only the owner can change platform settings', 403);
    }
    if (body.section === 'policy') {
      const saved = await saveResellerPolicy(current.db, body.policy);
      await audit(current.db, current.userId, 'settings.policy', null);
      return jsonSuccess(saved);
    }
    if (body.section === 'business') {
      await updatePlatformInfo(current.db, { platformName: body.platformName, supportContact: body.supportContact });
      await current.db.from('profiles').update({ timezone: body.timezone }).eq('id', current.userId);
      const row = (await current.db.from('platform_settings').select('id').limit(1).maybeSingle()) as QueryResult<{ id?: string } | null>;
      if (row.data?.id) {
        const saved = await current.db.from('platform_settings').update({ logo_url: body.logoUrl || null }).eq('id', row.data.id);
        if (saved.error) throw new ValidationError('LOGO_FAILED', saved.error.message);
      }
      await audit(current.db, current.userId, 'settings.business', null);
      return jsonSuccess({ ok: true });
    }
    if (body.section === 'legal') {
      const currentRow = (await current.db.from('platform_settings').select('id, legal_version').limit(1).maybeSingle()) as QueryResult<Record<string, unknown> | null>;
      const id = typeof currentRow.data?.id === 'string' ? currentRow.data.id : '';
      if (!id) throw new ValidationError('PLATFORM_SETTINGS_MISSING', 'Platform settings are missing.');
      const version = typeof currentRow.data?.legal_version === 'number' ? currentRow.data.legal_version + 1 : 1;
      const saved = await current.db.from('platform_settings').update({
        terms_of_service: body.terms,
        refund_policy: body.refund,
        privacy_policy: body.privacy,
        legal_version: version,
        legal_updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (saved.error) throw new ValidationError('LEGAL_FAILED', saved.error.message);
      await audit(current.db, current.userId, 'settings.legal', null);
      return jsonSuccess({ version });
    }
    if (body.section === 'fraud') {
      const row = (await current.db.from('platform_settings').select('id').limit(1).maybeSingle()) as QueryResult<{ id?: string } | null>;
      const id = row.data?.id;
      if (!id) throw new ValidationError('PLATFORM_SETTINGS_MISSING', 'Platform settings are missing.');
      const saved = await current.db.from('platform_settings').update({
        fraud_orders_per_hour: body.ordersPerHour,
        fraud_orders_per_day: body.ordersPerDay,
        fraud_failed_claims_per_hour: body.failedClaimsPerHour,
        fraud_support_messages_per_hour: body.supportMessagesPerHour,
        fraud_referral_claims_per_day: body.referralClaimsPerDay,
        fraud_freebie_claims_per_day: body.freebieClaimsPerDay,
        fraud_discount_redemptions_per_customer: body.discountRedemptionsPerCustomer,
        fraud_new_account_order_cap: body.newAccountOrderCap,
        fraud_new_account_age_hours: body.newAccountAgeHours,
      }).eq('id', id);
      if (saved.error) throw new ValidationError('FRAUD_FAILED', saved.error.message);
      await audit(current.db, current.userId, 'settings.fraud', null);
      return jsonSuccess({ ok: true });
    }
    if (body.section === 'payments') {
      await savePaymentsSection(current.db, {
        bep20Enabled: body.bep20Enabled,
        address: body.address,
        confirmations: body.confirmations,
        expiryMinutes: body.expiryMinutes,
        minUsdt: body.minUsdt,
        maxUsdt: body.maxUsdt,
      });
      await audit(current.db, current.userId, 'settings.payments', null);
      return jsonSuccess({ ok: true });
    }
    if (body.section === 'payment_mode') {
      const saved = await savePaymentDemoMode(current.db, body.mode === 'demo');
      await current.db.from('audit_log').insert({
        actor_id: current.userId,
        tenant_id: null,
        action: 'settings.payment_mode',
        target_type: 'settings',
        target_id: 'payment_mode',
        reason: body.reason,
        after_val: { paymentMode: saved.paymentMode },
      });
      return jsonSuccess(saved);
    }
    if (body.section === 'notifications') {
      const row = (await current.db.from('platform_settings').select('id').limit(1).maybeSingle()) as QueryResult<{ id?: string } | null>;
      if (!row.data?.id) throw new ValidationError('PLATFORM_SETTINGS_MISSING', 'Platform settings are missing.');
      const saved = await current.db.from('platform_settings').update({
        alert_failed_order: body.failedOrder,
        alert_low_balance: body.lowBalance,
        alert_new_reseller: body.newReseller,
        alert_large_topup: body.largeTopup,
        quiet_start: body.quietStart || null,
        quiet_end: body.quietEnd || null,
      }).eq('id', row.data.id);
      if (saved.error) throw new ValidationError('NOTIFY_FAILED', saved.error.message);
      await audit(current.db, current.userId, 'settings.notifications', null);
      return jsonSuccess({ ok: true });
    }
    if (body.section === 'override') {
      const saved = await current.db.from('tenants').update({ reseller_policy_override: body.policy }).eq('id', body.tenantId);
      if (saved.error) throw new ValidationError('OVERRIDE_FAILED', saved.error.message);
      await audit(current.db, current.userId, 'settings.override', body.tenantId);
      return jsonSuccess({ ok: true });
    }
    if (body.goalUsdt !== undefined && body.goalUsdt !== '') {
      const minor = parseGoalUsdt(body.goalUsdt);
      await writeRevenueGoal(current.db, { role: current.role, tenantId: current.tenantId }, minor);
    }
    if (current.role === 'owner') {
      await saveOwnerStoreStatus(current.db, body.storeStatus, body.maintenanceMessage);
      await saveBotMenuToggles(current.db, {
        ...(body.botShowResellerSignup !== undefined ? { resellerSignup: body.botShowResellerSignup } : {}),
        ...(body.botShowMyApi !== undefined ? { myApi: body.botShowMyApi } : {}),
      });
    }
    await audit(current.db, current.userId, 'settings.store', current.tenantId);
    return jsonSuccess({ ok: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
