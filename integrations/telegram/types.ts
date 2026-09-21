/**
 * @file integrations/telegram/types.ts
 *
 * Telegram bot engine and API types.
 *
 * @module Telegram
 */

import type { DbClient } from '@/lib/supabase/query';
import type { BotConnection } from '@/modules/bots/types';
import type { Update } from 'grammy/types';

export type TelegramChatId = string;

export type TelegramSendMessageParams = {
  readonly chatId: TelegramChatId;
  readonly text: string;
};

export interface TelegramClient {
  sendMessage(params: TelegramSendMessageParams): Promise<void>;
}

export type TelegramUserPayload = {
  readonly id: number;
  readonly is_bot?: boolean;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
};

export type TelegramGetMeResult = {
  readonly id: number;
  readonly is_bot: boolean;
  readonly first_name: string;
  readonly username?: string;
  readonly can_join_groups?: boolean;
  readonly can_read_all_group_messages?: boolean;
};

export type TelegramWebhookInfo = {
  readonly url: string;
  readonly pending_update_count: number;
  readonly last_error_date?: number;
  readonly last_error_message?: string;
};

export type BotEngineContext = {
  readonly supabase: DbClient;
  readonly botConnection: BotConnection;
  readonly tenantId: string | null;
};

export type BotEngine = {
  processUpdate(update: Update): Promise<void>;
};

export type { Update };
