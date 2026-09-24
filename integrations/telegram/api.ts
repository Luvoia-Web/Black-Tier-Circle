/**
 * @file integrations/telegram/api.ts
 *
 * Thin Telegram Bot HTTP API client.
 * URLs include the bot token — never log request URLs or bodies that contain it.
 *
 * @module Telegram
 */

import { AppError } from '@/lib/errors';
import type { BotInfo } from '@/modules/bots/types';
import type { TelegramGetMeResult, TelegramWebhookInfo } from './types';

type TelegramApiResponse<T> = {
  readonly ok: boolean;
  readonly result?: T;
  readonly description?: string;
  readonly error_code?: number;
};

async function callTelegramApi<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    const init: RequestInit = { method: body === undefined ? 'GET' : 'POST' };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, init);
  } catch {
    throw new AppError('TELEGRAM_UNREACHABLE', `Telegram ${method} failed`, 502);
  }

  let payload: TelegramApiResponse<T>;
  try {
    payload = (await response.json()) as TelegramApiResponse<T>;
  } catch {
    throw new AppError('TELEGRAM_BAD_RESPONSE', `Telegram ${method} returned an invalid response`, 502);
  }

  if (!payload.ok || payload.result === undefined) {
    if (method === 'getMe') {
      throw new AppError('INVALID_BOT_TOKEN', 'Telegram rejected this bot token', 400);
    }
    throw new AppError('TELEGRAM_API_ERROR', `Telegram ${method} failed`, 502);
  }
  return payload.result;
}

/**
 * Validates a bot token via getMe.
 *
 * @param token - Plaintext bot token (never log)
 */
export async function telegramGetMe(token: string): Promise<BotInfo> {
  const result = await callTelegramApi<TelegramGetMeResult>(token, 'getMe');
  return {
    id: String(result.id),
    username: result.username ?? '',
    firstName: result.first_name,
    canJoinGroups: result.can_join_groups === true,
    canReadAllGroupMessages: result.can_read_all_group_messages === true,
  };
}

/**
 * Registers the platform webhook for this bot.
 *
 * @param token - Plaintext bot token (never log)
 * @param url - Public webhook URL
 * @param secretToken - X-Telegram-Bot-Api-Secret-Token value
 */
const BOT_COMMANDS = [
  { command: 'start', description: 'Start and open the menu' },
  { command: 'menu', description: 'Open the main menu' },
  { command: 'shop', description: 'Browse products' },
  { command: 'wallet', description: 'Open your wallet' },
  { command: 'deposit', description: 'Add funds to wallet' },
  { command: 'orders', description: 'View your orders' },
  { command: 'profile', description: 'Your profile and account' },
  { command: 'support', description: 'Get help and support' },
  { command: 'refer', description: 'Refer friends and earn' },
  { command: 'api', description: 'Access developer API' },
  { command: 'find', description: 'Find an order by ID' },
  { command: 'terms', description: 'Terms and policies' },
];

/**
 * Registers the slash-command menu and the chat Menu button.
 * Failures are ignored by callers that must not block checkout.
 */
export async function telegramSetMyCommands(token: string): Promise<void> {
  await callTelegramApi<boolean>(token, 'setMyCommands', { commands: BOT_COMMANDS });
  await callTelegramApi<boolean>(token, 'setChatMenuButton', {
    menu_button: { type: 'commands' },
  });
}

export async function telegramSetWebhook(token: string, url: string, secretToken: string): Promise<void> {
  await callTelegramApi<boolean>(token, 'setWebhook', {
    url,
    secret_token: secretToken,
  });
}

/**
 * Removes the Telegram webhook for this bot.
 *
 * @param token - Plaintext bot token (never log)
 */
export async function telegramDeleteWebhook(token: string): Promise<void> {
  await callTelegramApi<boolean>(token, 'deleteWebhook');
}

/**
 * Reads webhook health from Telegram.
 *
 * @param token - Plaintext bot token (never log)
 */
export async function telegramGetWebhookInfo(token: string): Promise<TelegramWebhookInfo> {
  return callTelegramApi<TelegramWebhookInfo>(token, 'getWebhookInfo');
}
