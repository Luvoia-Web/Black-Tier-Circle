/**
 * @file integrations/telegram/types.ts
 *
 * grammY wrapper types. No live Telegram I/O in Phase 0.
 *
 * @module Telegram
 */

export type TelegramChatId = string;

export type TelegramSendMessageParams = {
  readonly chatId: TelegramChatId;
  readonly text: string;
};

export interface TelegramClient {
  sendMessage(params: TelegramSendMessageParams): Promise<void>;
}
