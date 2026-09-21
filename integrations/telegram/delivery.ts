/**
 * @file integrations/telegram/delivery.ts
 *
 * Telegram delivery helpers used by fulfillment.
 * Kept separate from the webhook bot engine to avoid import cycles with payments.
 *
 * @module Telegram
 */

import { Bot } from 'grammy';
import { FULFILLMENT_CONFIG } from '@/lib/fulfillment-config';
import { logger } from '@/lib/logger';

/**
 * Sends a file to the customer using a short-lived signed URL.
 *
 * @param botToken - Plaintext bot token (never log)
 * @param chatId - Telegram chat id
 * @param signedUrl - Signed download URL
 * @param productTitle - Product title for the caption
 */
export async function sendFileDelivery(
  botToken: string,
  chatId: string,
  signedUrl: string,
  productTitle: string,
): Promise<void> {
  const bot = new Bot(botToken);
  try {
    await bot.api.sendDocument(chatId, signedUrl, {
      caption: FULFILLMENT_CONFIG.delivery.fileDeliveryCaption(productTitle),
      parse_mode: 'Markdown',
    });
  } catch (error: unknown) {
    logger.error('telegram file delivery failed', {
      chatId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}

/**
 * Sends a text delivery or status message to the customer.
 *
 * @param botToken - Plaintext bot token (never log)
 * @param chatId - Telegram chat id
 * @param message - Markdown message body
 */
export async function sendTextDelivery(botToken: string, chatId: string, message: string): Promise<void> {
  const bot = new Bot(botToken);
  try {
    await bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error: unknown) {
    logger.error('telegram text delivery failed', {
      chatId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}
