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
import { sanitizeInput } from '@/lib/sanitize';

function plainTitle(text: string): string {
  return sanitizeInput(text).replace(/[*_`[\]]/g, '').slice(0, 200);
}

/**
 * Sends a file to the customer using a short-lived signed URL.
 *
 * @param botToken - Plaintext bot token (never log)
 * @param chatId - Telegram chat id
 * @param signedUrl - Signed download URL
 * @param productTitle - Product title for the caption
 * @param orderRef - Short order id shown in the caption
 */
export async function sendFileDelivery(
  botToken: string,
  chatId: string,
  signedUrl: string,
  productTitle: string,
  orderRef?: string,
): Promise<void> {
  const bot = new Bot(botToken);
  try {
    await bot.api.sendDocument(chatId, signedUrl, {
      caption: FULFILLMENT_CONFIG.delivery.fileDeliveryCaption(plainTitle(productTitle), orderRef),
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

/**
 * Sends supplier delivery content: URL as an inline button, otherwise formatted text.
 *
 * @param botToken - Plaintext bot token (never log)
 * @param chatId - Telegram chat id
 * @param deliveryData - URL, license key, or instructions
 * @param productTitle - Product title for the caption
 */
export async function sendSupplierDelivery(
  botToken: string,
  chatId: string,
  deliveryData: string,
  productTitle: string,
): Promise<void> {
  const bot = new Bot(botToken);
  const isUrl = /^https?:\/\//i.test(deliveryData.trim());
  try {
    const safeTitle = plainTitle(productTitle);
    const safeContent = sanitizeInput(deliveryData).slice(0, 3000);
    if (isUrl) {
      await bot.api.sendMessage(chatId, `✅ *${safeTitle}* is ready.`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: 'Access Your Content', url: deliveryData.trim() }]],
        },
      });
      return;
    }
    await bot.api.sendMessage(chatId, `✅ *${safeTitle}* is ready.\n\n${safeContent}`, { parse_mode: 'Markdown' });
  } catch (error: unknown) {
    logger.error('telegram supplier delivery failed', {
      chatId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}

/**
 * Sends an HTML notice that is not a product file.
 */
export async function sendHtmlNotice(botToken: string, chatId: string, html: string): Promise<void> {
  const bot = new Bot(botToken);
  await bot.api.sendMessage(chatId, html, { parse_mode: 'HTML' });
}
