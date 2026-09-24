/**
 * @file modules/platform/types.ts
 *
 * Platform settings stored in the database and edited from the owner dashboard.
 * Encrypted secrets are never part of this public shape.
 *
 * @module Platform
 */

export type OwnerBotStatus = 'connected' | 'disconnected' | 'error';

export type PlatformSettings = {
  id: string;
  ownerBotUsername: string | null;
  ownerBotId: string | null;
  ownerBotStatus: OwnerBotStatus;
  ownerBotLastHealthAt: Date | null;
  platformUsdtWalletBep20: string | null;
  platformUsdtWalletTrc20: string | null;
  trc20Enabled: boolean;
  binancePayMerchantId: string | null;
  binancePayEnabled: boolean;
  /** True when both Binance API key and secret are stored. Values are never exposed. */
  binancePayConfigured: boolean;
  bep20Enabled: boolean;
  platformName: string;
  supportContact: string | null;
  supportTelegram: string | null;
};

export type PlatformSettingsRow = {
  readonly id: string;
  readonly owner_bot_token_encrypted: string | null;
  readonly owner_bot_username: string | null;
  readonly owner_bot_id: string | null;
  readonly owner_bot_webhook_secret: string | null;
  readonly owner_bot_status: string | null;
  readonly owner_bot_last_health_at: string | null;
  readonly platform_usdt_wallet_bep20: string | null;
  readonly platform_usdt_wallet_trc20?: string | null;
  readonly trc20_enabled?: boolean | null;
  readonly binance_pay_api_key_encrypted: string | null;
  readonly binance_pay_api_secret_encrypted: string | null;
  readonly binance_pay_merchant_id: string | null;
  readonly binance_pay_enabled: boolean | null;
  readonly bep20_enabled: boolean | null;
  readonly platform_name: string | null;
  readonly support_contact: string | null;
  readonly support_telegram: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type ConnectOwnerBotResult = {
  readonly username: string;
  readonly botId: string;
  readonly webhookUrl: string;
};

export type UpdatePaymentSettingsInput = {
  readonly platformUsdtWalletBep20?: string | null;
  readonly platformUsdtWalletTrc20?: string | null;
  readonly trc20Enabled?: boolean;
  readonly binancePayApiKey?: string;
  readonly binancePayApiSecret?: string;
  readonly binancePayMerchantId?: string | null;
  readonly binancePayEnabled?: boolean;
  readonly bep20Enabled?: boolean;
};

export type UpdatePlatformInfoInput = {
  readonly platformName?: string;
  readonly supportContact?: string | null;
  readonly supportTelegram?: string | null;
};

export type DecryptedBinanceCredentials = {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly merchantId: string;
};
