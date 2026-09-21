/**
 * @file modules/tenant-settings/types.ts
 *
 * Per-tenant store settings. Binance secrets never leave the server decrypted.
 *
 * @module TenantSettings
 */

export type StoreStatus = 'open' | 'maintenance';

export type TenantSettings = {
  readonly tenantId: string;
  readonly storeName: string | null;
  readonly storeStatus: StoreStatus;
  readonly maintenanceMsg: string | null;
  readonly supportContact: string | null;
  readonly supportChatUrl: string | null;
  readonly supportPhone: string | null;
  readonly supportMessage: string | null;
  readonly termsOfService: string | null;
  readonly refundPolicy: string | null;
  readonly privacyPolicy: string | null;
  readonly binanceMerchantUid: string | null;
  readonly binancePayConfigured: boolean;
  readonly usdtWalletBep20: string | null;
  readonly usdtMinimumBep20: string;
  readonly resellerSignupEnabled: boolean;
  readonly resellerSignupMessage: string | null;
  readonly markupPercent: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type TenantSettingsRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly store_name: string | null;
  readonly store_status: string;
  readonly maintenance_msg: string | null;
  readonly support_contact: string | null;
  readonly support_chat_url: string | null;
  readonly support_phone: string | null;
  readonly support_message: string | null;
  readonly terms_of_service: string | null;
  readonly refund_policy: string | null;
  readonly privacy_policy: string | null;
  readonly binance_merchant_uid: string | null;
  readonly binance_api_key_encrypted: string | null;
  readonly binance_api_secret_encrypted: string | null;
  readonly usdt_wallet_bep20: string | null;
  readonly usdt_minimum_bep20: string | number | null;
  readonly reseller_signup_enabled: boolean | null;
  readonly reseller_signup_message: string | null;
  readonly markup_percent: string | number | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type UpdateTenantSettingsInput = {
  readonly storeName?: string | null;
  readonly storeStatus?: StoreStatus;
  readonly maintenanceMsg?: string | null;
  readonly supportContact?: string | null;
  readonly supportChatUrl?: string | null;
  readonly supportPhone?: string | null;
  readonly supportMessage?: string | null;
  readonly termsOfService?: string | null;
  readonly refundPolicy?: string | null;
  readonly privacyPolicy?: string | null;
  readonly binanceMerchantUid?: string | null;
  readonly binanceApiKey?: string;
  readonly binanceApiSecret?: string;
  readonly usdtWalletBep20?: string | null;
  readonly usdtMinimumBep20?: string;
  readonly resellerSignupEnabled?: boolean;
  readonly resellerSignupMessage?: string | null;
  readonly markupPercent?: number;
};
