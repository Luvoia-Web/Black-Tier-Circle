/**
 * @file modules/bots/types.ts
 *
 * Telegram bot connection types.
 * encrypted_token is NEVER exposed on BotConnection — decrypted only inside the bot engine.
 *
 * @module Bots
 */

export type BotConnectionStatus = 'connected' | 'disconnected' | 'error';

export type BotConnection = {
  id: string;
  tenantId: string;
  telegramBotId: string;
  username: string;
  webhookSecret: string;
  status: BotConnectionStatus;
  lastHealthAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BotConnectionWithToken = BotConnection & {
  readonly encryptedToken: string;
};

export type ConnectBotInput = {
  tenantId: string;
  botToken: string; // plaintext — encrypted immediately on receipt, never stored plain
};

export type BotInfo = {
  id: string; // Telegram bot ID (numeric, stored as string)
  username: string;
  firstName: string;
  canJoinGroups: boolean;
  canReadAllGroupMessages: boolean;
};

export type CustomerRecord = {
  id: string;
  botId: string;
  telegramUserId: string;
  telegramChatId: string;
  firstName: string | null;
  username: string | null;
  isBlocked: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TelegramUser = {
  id: number;
  first_name: string;
  username?: string;
};

export type BotConnectionRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly telegram_bot_id: string;
  readonly username: string;
  readonly encrypted_token: string;
  readonly webhook_secret: string;
  readonly status: string;
  readonly last_health_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type CustomerRow = {
  readonly id: string;
  readonly bot_id: string | null;
  readonly telegram_user_id: string;
  readonly telegram_chat_id: string;
  readonly first_name: string | null;
  readonly username: string | null;
  readonly is_blocked: boolean;
  readonly created_at: string;
  readonly updated_at: string;
};

export type ResellerBotOverview = {
  readonly connection: BotConnection;
  readonly tenantName: string;
  readonly resellerName: string;
  readonly customerCount: number;
};
