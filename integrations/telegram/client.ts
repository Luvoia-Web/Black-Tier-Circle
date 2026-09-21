/**
 * @file integrations/telegram/client.ts
 *
 * grammY wrapper stub. Phase 4 wires Bot.api.sendMessage.
 *
 * Importing grammY here keeps the dependency installed and typed
 * without constructing a bot with a real token in Phase 0.
 *
 * @module Telegram
 */

import { Bot } from 'grammy';
import { logger } from '@/lib/logger';
import type { TelegramClient, TelegramSendMessageParams } from './types';

export type { TelegramChatId, TelegramClient, TelegramSendMessageParams } from './types';

/**
 * Returns a Telegram client that logs instead of sending.
 *
 * @returns Sandbox TelegramClient
 *
 * STUB(phase-4): Real implementation added in Phase 4 — Telegram bot connections
 */
export function createTelegramClient(): TelegramClient {
  return {
    async sendMessage(params: TelegramSendMessageParams): Promise<void> {
      logger.warn('sendTelegramMessage called but not yet implemented', {
        chatId: params.chatId,
        textLength: params.text.length,
      });
    },
  };
}

/**
 * Type-level hook so grammY Bot remains part of the compile graph.
 *
 * @param token - Bot token; placeholder tokens must not be used to poll
 * @returns grammY Bot instance for later webhook binding
 */
export function createGrammyBot(token: string): Bot {
  return new Bot(token);
}
