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
      parse_mode: 'HTML',
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
 * @param message - HTML message body
 */
export async function sendTextDelivery(botToken: string, chatId: string, message: string): Promise<void> {
  const bot = new Bot(botToken);
  try {
    await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' });
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
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendSupplierDelivery(
  botToken: string,
  chatId: string,
  deliveryData: string,
  productTitle: string,
  orderId?: string,
): Promise<void> {
  const bot = new Bot(botToken);
  try {
    const safeTitle = escapeHtml(plainTitle(productTitle));
    const safeContent = escapeHtml(sanitizeInput(deliveryData).slice(0, 3000));
    const orderShortId = orderId ? orderId.slice(0, 8).toUpperCase() : null;
    const orderLine = orderShortId ? `🔖 Order: <code>${orderShortId}</code>\n\n` : '';
    await bot.api.sendMessage(
      chatId,
      `🎉 <b>Your Order is Ready!</b>\n\n📦 <b>${safeTitle}</b>\n${orderLine}Here is your delivery:\n\n<code>${safeContent}</code>\n\n✅ Order complete. Thank you for your purchase!\nNeed help? /support`,
      { parse_mode: 'HTML' },
    );
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
