/**
 * @file modules/bots/types.ts
 *
 * Telegram bot connection types.
 *
 * @module Bots
 */

export type BotConnectionStatus = 'disconnected' | 'connected' | 'error';

export type BotConnection = {
  readonly id: string;
  readonly tenantId: string;
  readonly telegramBotId: string;
  readonly username: string;
  readonly status: BotConnectionStatus;
};
