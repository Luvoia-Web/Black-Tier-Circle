/**
 * @file app/api/reseller/settings/route.ts
 *
 * GET/PATCH reseller tenant settings. tenant_id from session only.
 *
 * Phase 9 auth audit: getUser() via requireReseller, role=reseller, tenant active.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { sanitizeInput } from '@/lib/sanitize';
import { UpdateTenantSettingsSchema } from '@/lib/validations/tenant-settings';
import { updateTenantDisplayName } from '@/modules/tenants';
import { getTenantSettings, updateTenantSettings } from '@/modules/tenant-settings';

export const dynamic = 'force-dynamic';

function cleanText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return sanitizeInput(value);
}

export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    const settings = await getTenantSettings(asDbClient(session.admin), session.tenant.id);
    return jsonSuccess({
      settings,
      tenant: { id: session.tenant.id, displayName: session.tenant.displayName, status: session.tenant.status },
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const parsed = UpdateTenantSettingsSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    if (parsed.storeName) {
      await updateTenantDisplayName(db, session.tenant.id, sanitizeInput(parsed.storeName));
    }
    const settings = await updateTenantSettings(db, session.tenant.id, {
      ...(parsed.storeName !== undefined ? { storeName: cleanText(parsed.storeName) ?? null } : {}),
      ...(parsed.storeStatus !== undefined ? { storeStatus: parsed.storeStatus } : {}),
      ...(parsed.maintenanceMsg !== undefined ? { maintenanceMsg: cleanText(parsed.maintenanceMsg) ?? null } : {}),
      ...(parsed.supportContact !== undefined ? { supportContact: cleanText(parsed.supportContact) ?? null } : {}),
      ...(parsed.supportChatUrl !== undefined ? { supportChatUrl: cleanText(parsed.supportChatUrl) ?? null } : {}),
      ...(parsed.supportPhone !== undefined ? { supportPhone: cleanText(parsed.supportPhone) ?? null } : {}),
      ...(parsed.supportMessage !== undefined ? { supportMessage: cleanText(parsed.supportMessage) ?? null } : {}),
      ...(parsed.termsOfService !== undefined ? { termsOfService: cleanText(parsed.termsOfService) ?? null } : {}),
      ...(parsed.refundPolicy !== undefined ? { refundPolicy: cleanText(parsed.refundPolicy) ?? null } : {}),
      ...(parsed.privacyPolicy !== undefined ? { privacyPolicy: cleanText(parsed.privacyPolicy) ?? null } : {}),
      ...(parsed.binanceMerchantUid !== undefined
        ? { binanceMerchantUid: cleanText(parsed.binanceMerchantUid) ?? null }
        : {}),
      ...(parsed.binanceApiKey !== undefined ? { binanceApiKey: parsed.binanceApiKey } : {}),
      ...(parsed.binanceApiSecret !== undefined ? { binanceApiSecret: parsed.binanceApiSecret } : {}),
      ...(parsed.binancePayEnabled !== undefined ? { binancePayEnabled: parsed.binancePayEnabled } : {}),
      ...(parsed.useOwnUsdtWallet !== undefined ? { useOwnUsdtWallet: parsed.useOwnUsdtWallet } : {}),
      ...(parsed.usdtWalletBep20 !== undefined ? { usdtWalletBep20: cleanText(parsed.usdtWalletBep20) ?? null } : {}),
      ...(parsed.usdtWalletTrc20 !== undefined ? { usdtWalletTrc20: cleanText(parsed.usdtWalletTrc20) ?? null } : {}),
      ...(parsed.useOwnTrc20Wallet !== undefined ? { useOwnTrc20Wallet: parsed.useOwnTrc20Wallet } : {}),
      ...(parsed.trc20Enabled !== undefined ? { trc20Enabled: parsed.trc20Enabled } : {}),
      ...(parsed.announcementChannelId !== undefined
        ? { announcementChannelId: cleanText(parsed.announcementChannelId) ?? null }
        : {}),
      ...(parsed.usdtMinimumBep20 !== undefined ? { usdtMinimumBep20: parsed.usdtMinimumBep20 } : {}),
      ...(parsed.resellerSignupEnabled !== undefined
        ? { resellerSignupEnabled: parsed.resellerSignupEnabled }
        : {}),
      ...(parsed.resellerSignupMessage !== undefined
        ? { resellerSignupMessage: cleanText(parsed.resellerSignupMessage) ?? null }
        : {}),
      ...(parsed.markupPercent !== undefined ? { markupPercent: parsed.markupPercent } : {}),
      ...(parsed.notifyOrderPlaced !== undefined ? { notifyOrderPlaced: parsed.notifyOrderPlaced } : {}),
      ...(parsed.notifyOrderDelivered !== undefined ? { notifyOrderDelivered: parsed.notifyOrderDelivered } : {}),
      ...(parsed.notifyBalanceLow !== undefined ? { notifyBalanceLow: parsed.notifyBalanceLow } : {}),
      ...(parsed.notifyBalanceThreshold !== undefined ? { notifyBalanceThreshold: parsed.notifyBalanceThreshold } : {}),
      ...(parsed.notifyProductAdded !== undefined ? { notifyProductAdded: parsed.notifyProductAdded } : {}),
    });
    return jsonSuccess({ settings });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
