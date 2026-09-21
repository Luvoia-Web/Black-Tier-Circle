/**
 * @file integrations/telegram/client.ts
 *
 * Telegram bot engine using grammY.
 * One BotEngine instance per connected bot (created per webhook request).
 *
 * Bot UX flow for customers:
 * /start → welcome message + main menu
 * "🛍 Browse Products" → product list with inline keyboard
 * [Select product] → product detail with price + "Buy Now" button
 * "Buy Now" → order created + payment instructions shown
 * "📦 My Orders" → list of customer's recent orders
 * "❓ Help" → support message
 *
 * SECURITY: webhook secret verified BEFORE this engine is invoked.
 * Bot token decrypted only here, used only for sending messages, never logged.
 */

import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { logger } from '@/lib/logger';
import { formatUsdt } from '@/lib/money';
import { OWNER_STORE_BOT_ID } from '@/lib/owner-bot';
import { getBep20PayoutAddress, PAYMENT_CONFIG } from '@/lib/payment-config';
import { BINANCE_NUMERIC_ORDER_ID_REGEX, TX_HASH_REGEX } from '@/lib/validations/payments';
import { getOrCreateCustomer, updateBotHealth } from '@/modules/bots';
import { getProduct, listProducts } from '@/modules/catalog';
import { createOrder, listOrders } from '@/modules/orders';
import {
  createBinancePayOrder,
  verifyBep20Claim,
  verifyBinancePayClaim,
} from '@/modules/payments';
import { listResellerListings } from '@/modules/pricing';
import type { Product } from '@/modules/catalog/types';
import type { CustomerRecord } from '@/modules/bots/types';
import type { BotEngine, BotEngineContext, TelegramClient, TelegramSendMessageParams, Update } from './types';

export type { TelegramChatId, TelegramClient, TelegramSendMessageParams } from './types';
export type { BotEngine, BotEngineContext };

const processedUpdateIds = new Set<string>();
const PROCESSED_UPDATE_LIMIT = 5000;

export const MESSAGES = {
  welcome: (firstName: string) =>
    `👋 Welcome${firstName ? `, ${firstName}` : ''}!\n\nYou can browse and buy products directly here.\n\nUse the menu below to get started.`,

  mainMenu: 'What would you like to do?',

  productList: (products: { title: string; priceUsdt: string }[]) =>
    products.length === 0
      ? '😔 No products available right now. Check back soon!'
      : `🛍 *Available Products*\n\nSelect a product to view details:`,

  productDetail: (product: {
    title: string;
    description: string | null;
    priceUsdt: string;
    deliveryMins: number | null;
  }) =>
    `📦 *${product.title}*\n\n${product.description ?? 'No description.'}\n\n💵 Price: *${product.priceUsdt} USDT*${product.deliveryMins ? `\n⏱ Delivery: ~${product.deliveryMins} minutes` : ''}\n\nReady to purchase?`,

  orderCreated: (orderId: string, amountUsdt: string) =>
    `✅ *Order Placed!*\n\nOrder ID: \`${orderId.slice(0, 8).toUpperCase()}\`\nAmount: *${amountUsdt} USDT*\n\nChoose a payment method below.`,

  paymentInstructions: (walletAddress: string, amountUsdt: string, orderId: string) =>
    `💳 *Payment Instructions*\n\nSend exactly:\n*${amountUsdt} USDT* (BEP20)\n\nTo wallet:\n\`${walletAddress}\`\n\nAfter sending, reply with your transaction hash.\n\nOrder ref: \`${orderId.slice(0, 8).toUpperCase()}\``,

  paymentMethodChoice: '💳 How would you like to pay?',
  binancePayButton: '💳 Binance Pay',
  bep20Button: '📤 Send USDT (BEP20)',
  demoModeNotice: '⚠️ *Demo Mode* — This is a test environment. No real payment required.',
  binancePayLink: (_checkoutUrl: string) => `Click below to complete payment on Binance Pay:`,
  binancePayFollowUp: 'After paying, reply with your Binance Pay Order ID.',
  bep20Instructions: (address: string, amountUsdt: string) =>
    `📤 *BEP20 Transfer Instructions*\n\nSend exactly:\n*${amountUsdt} USDT* (BEP20 network)\n\nTo address:\n\`${address}\`\n\n_Copy the address carefully. After sending, reply with your TX hash._`,
  verifying: '⏳ Verifying your payment...',
  paymentVerified:
    '✅ *Payment Confirmed!*\n\nYour order is being processed. You will receive your product shortly.',
  paymentFailed: (reason: string) =>
    `❌ *Payment Not Verified*\n\n${reason}\n\nPlease try again or contact support.`,
  paymentRefNeeded: 'Please send your payment reference (Binance Pay Order ID or BEP20 TX hash).',

  noOrders: '📭 You have no orders yet.',

  ordersList: '📦 *Your Recent Orders*\n\nHere are your last 5 orders:',

  help: '❓ *Help*\n\nTo place an order, use "Browse Products" and select what you want.\n\nFor payment issues or other help, contact support.',

  error: '⚠️ Something went wrong. Please try again or contact support.',

  blocked: '🚫 Your account has been blocked. Contact support for assistance.',

  unrecognized: "I didn't understand that. Please use the menu below.",
} as const;

const MAIN_MENU_KEYBOARD = new Keyboard()
  .text('🛍 Browse Products')
  .text('📦 My Orders')
  .row()
  .text('❓ Help')
  .resized()
  .persistent();

function priceLabel(minor: bigint): string {
  return formatUsdt(minor).replace(' USDT', '');
}

function paymentWallet(): string {
  return getBep20PayoutAddress();
}

function classifyPaymentText(text: string): 'binance' | 'bep20' | 'unknown' {
  const trimmed = text.trim();
  if (TX_HASH_REGEX.test(trimmed) || trimmed.startsWith(PAYMENT_CONFIG.demo.failTxPrefix)) {
    return 'bep20';
  }
  if (BINANCE_NUMERIC_ORDER_ID_REGEX.test(trimmed)) {
    return 'binance';
  }
  if (
    trimmed.startsWith(PAYMENT_CONFIG.demo.successPrefix) ||
    trimmed.startsWith(PAYMENT_CONFIG.demo.failPrefix)
  ) {
    return 'binance';
  }
  return 'unknown';
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function markProcessed(botId: string, updateId: number): boolean {
  const key = `${botId}:${updateId}`;
  if (processedUpdateIds.has(key)) {
    return true;
  }
  processedUpdateIds.add(key);
  if (processedUpdateIds.size > PROCESSED_UPDATE_LIMIT) {
    const first = processedUpdateIds.values().next().value;
    if (typeof first === 'string') {
      processedUpdateIds.delete(first);
    }
  }
  return false;
}

type CatalogItem = {
  readonly product: Product;
  readonly priceMinor: bigint;
};

async function loadCatalog(context: BotEngineContext): Promise<CatalogItem[]> {
  if (context.tenantId === null) {
    const products = await listProducts(context.supabase, { status: 'published' });
    return products.map((product) => ({ product, priceMinor: product.retailPriceMinor }));
  }
  const listings = await listResellerListings(context.supabase, context.tenantId);
  return listings
    .filter((listing) => listing.isVisible && listing.product.status === 'published')
    .map((listing) => ({ product: listing.product, priceMinor: listing.retailPriceMinor }));
}

function extractFrom(update: Update): { user: { id: number; first_name: string; username?: string }; chatId: string } | null {
  const message = update.message ?? update.edited_message ?? update.callback_query?.message;
  const from = update.message?.from ?? update.edited_message?.from ?? update.callback_query?.from;
  const chatId = message && 'chat' in message ? String(message.chat.id) : from ? String(from.id) : null;
  if (!from || chatId === null) {
    return null;
  }
  const payload: { id: number; first_name: string; username?: string } = {
    id: from.id,
    first_name: from.first_name,
  };
  if (from.username !== undefined) {
    payload.username = from.username;
  }
  return { user: payload, chatId };
}

function updateType(update: Update): string {
  if (update.message) {
    return 'message';
  }
  if (update.callback_query) {
    return 'callback_query';
  }
  if (update.edited_message) {
    return 'edited_message';
  }
  return 'other';
}

/**
 * Creates a per-request bot engine bound to one decrypted token.
 *
 * @param botToken - Plaintext token (never log)
 * @param context - Database client, bot connection, tenant (null = owner store)
 */
export function createBotEngine(botToken: string, context: BotEngineContext): BotEngine {
  const bot = new Bot(botToken);
  let customer: CustomerRecord | null = null;
  const pendingByChat = new Map<string, { orderId: string; method?: 'binance_pay' | 'usdt_bep20' }>();

  async function showMainMenu(chatId: number | string, text: string): Promise<void> {
    await bot.api.sendMessage(chatId, text, { reply_markup: MAIN_MENU_KEYBOARD });
  }

  async function sendDemoNotice(chatId: number | string): Promise<void> {
    if (PAYMENT_CONFIG.mode === 'demo') {
      await bot.api.sendMessage(chatId, MESSAGES.demoModeNotice, { parse_mode: 'Markdown' });
    }
  }

  async function showPaymentChoice(chatId: number | string, orderId: string): Promise<void> {
    const keyboard = new InlineKeyboard()
      .text(MESSAGES.binancePayButton, `pay:binance:${orderId}`)
      .text(MESSAGES.bep20Button, `pay:bep20:${orderId}`);
    await bot.api.sendMessage(chatId, MESSAGES.paymentMethodChoice, { reply_markup: keyboard });
    await sendDemoNotice(chatId);
  }

  async function startBinancePay(chatId: number | string, orderId: string): Promise<void> {
    pendingByChat.set(String(chatId), { orderId, method: 'binance_pay' });
    const checkout = await createBinancePayOrder(context.supabase, orderId);
    const keyboard = new InlineKeyboard().url('Open Binance Pay', checkout.checkoutUrl);
    await bot.api.sendMessage(chatId, MESSAGES.binancePayLink(checkout.checkoutUrl), {
      reply_markup: keyboard,
    });
    await sendDemoNotice(chatId);
    await bot.api.sendMessage(chatId, MESSAGES.binancePayFollowUp);
  }

  async function startBep20(chatId: number | string, orderId: string, amountUsdt: string): Promise<void> {
    pendingByChat.set(String(chatId), { orderId, method: 'usdt_bep20' });
    await bot.api.sendMessage(chatId, MESSAGES.bep20Instructions(paymentWallet(), amountUsdt), {
      parse_mode: 'Markdown',
    });
    await sendDemoNotice(chatId);
  }

  async function handlePaymentReference(chatId: number | string, text: string): Promise<boolean> {
    const kind = classifyPaymentText(text);
    const pending = pendingByChat.get(String(chatId));
    let orderId = pending?.orderId;
    if (orderId === undefined && customer !== null && kind !== 'unknown') {
      const orders = await listOrders(context.supabase, { customerId: customer.id, limit: 5 });
      const payable = orders.find(
        (order) => order.paymentStatus === 'awaiting' || order.paymentStatus === 'pending_verification',
      );
      orderId = payable?.id;
    }
    if (kind === 'unknown' || orderId === undefined) {
      return false;
    }
    await bot.api.sendMessage(chatId, MESSAGES.verifying);
    if (PAYMENT_CONFIG.mode === 'demo') {
      await sleep(PAYMENT_CONFIG.demo.verificationDelayMs);
    }
    const result =
      kind === 'binance'
        ? await verifyBinancePayClaim(context.supabase, { orderId, binanceOrderId: text.trim() })
        : await verifyBep20Claim(context.supabase, { orderId, txHash: text.trim() });
    if (result.verified) {
      pendingByChat.delete(String(chatId));
      await bot.api.sendMessage(chatId, MESSAGES.paymentVerified, {
        parse_mode: 'Markdown',
        reply_markup: MAIN_MENU_KEYBOARD,
      });
      return true;
    }
    await bot.api.sendMessage(chatId, MESSAGES.paymentFailed(result.rejectReason ?? 'Verification failed'), {
      parse_mode: 'Markdown',
      reply_markup: MAIN_MENU_KEYBOARD,
    });
    return true;
  }

  async function showProductList(chatId: number | string): Promise<void> {
    const catalog = await loadCatalog(context);
    const summary = catalog.map((item) => ({
      title: item.product.title,
      priceUsdt: priceLabel(item.priceMinor),
    }));
    const keyboard = new InlineKeyboard();
    for (const item of catalog) {
      keyboard.text(`${item.product.title} · ${priceLabel(item.priceMinor)} USDT`, `product:${item.product.id}`).row();
    }
    await bot.api.sendMessage(chatId, MESSAGES.productList(summary), {
      parse_mode: 'Markdown',
      reply_markup: catalog.length > 0 ? keyboard : MAIN_MENU_KEYBOARD,
    });
  }

  async function showProductDetail(chatId: number | string, productId: string): Promise<void> {
    const catalog = await loadCatalog(context);
    const item = catalog.find((entry) => entry.product.id === productId);
    const product = item?.product ?? (await getProduct(context.supabase, productId));
    const priceMinor = item?.priceMinor ?? product.retailPriceMinor;
    const keyboard = new InlineKeyboard().text('Buy Now', `buy:${product.id}`);
    await bot.api.sendMessage(
      chatId,
      MESSAGES.productDetail({
        title: product.title,
        description: product.description,
        priceUsdt: priceLabel(priceMinor),
        deliveryMins: product.estimatedDeliveryMinutes,
      }),
      { parse_mode: 'Markdown', reply_markup: keyboard },
    );
  }

  async function handleBuy(chatId: number | string, productId: string, updateId: number): Promise<void> {
    if (customer === null) {
      throw new Error('missing customer');
    }
    const order = await createOrder(context.supabase, {
      channel: context.tenantId === null ? 'owner_store' : 'reseller_bot',
      ...(context.tenantId !== null ? { tenantId: context.tenantId } : {}),
      botId: context.botConnection.id,
      customerId: customer.id,
      productId,
      idempotencyKey: `tg:${context.botConnection.id}:${updateId}:${productId}`,
    });
    const amount = priceLabel(order.quotedRetailPriceMinor);
    pendingByChat.set(String(chatId), { orderId: order.id });
    await bot.api.sendMessage(chatId, MESSAGES.orderCreated(order.id, amount), { parse_mode: 'Markdown' });
    await showPaymentChoice(chatId, order.id);
  }

  async function showOrders(chatId: number | string): Promise<void> {
    if (customer === null) {
      throw new Error('missing customer');
    }
    const orders = await listOrders(context.supabase, { customerId: customer.id, limit: 5 });
    if (orders.length === 0) {
      await bot.api.sendMessage(chatId, MESSAGES.noOrders, { reply_markup: MAIN_MENU_KEYBOARD });
      return;
    }
    const lines = orders.map((order) => {
      const ref = order.id.slice(0, 8).toUpperCase();
      return `• \`${ref}\` — ${priceLabel(order.quotedRetailPriceMinor)} USDT — ${order.paymentStatus}`;
    });
    await bot.api.sendMessage(chatId, `${MESSAGES.ordersList}\n\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
      reply_markup: MAIN_MENU_KEYBOARD,
    });
  }

  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name ?? '';
    await ctx.reply(MESSAGES.welcome(name), { reply_markup: MAIN_MENU_KEYBOARD });
  });

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (chatId === undefined) {
      return;
    }
    if (data.startsWith('product:')) {
      await showProductDetail(chatId, data.slice('product:'.length));
      return;
    }
    if (data.startsWith('buy:')) {
      await handleBuy(chatId, data.slice('buy:'.length), ctx.update.update_id);
      return;
    }
    if (data.startsWith('pay:binance:')) {
      await startBinancePay(chatId, data.slice('pay:binance:'.length));
      return;
    }
    if (data.startsWith('pay:bep20:')) {
      const orderId = data.slice('pay:bep20:'.length);
      const orders = await listOrders(context.supabase, {
        ...(customer !== null ? { customerId: customer.id } : {}),
        limit: 10,
      });
      const order = orders.find((item) => item.id === orderId);
      await startBep20(chatId, orderId, priceLabel(order?.quotedRetailPriceMinor ?? 0n));
    }
  });

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) {
      return;
    }
    if (text === '🛍 Browse Products') {
      await showProductList(ctx.chat.id);
      return;
    }
    if (text === '📦 My Orders') {
      await showOrders(ctx.chat.id);
      return;
    }
    if (text === '❓ Help') {
      await ctx.reply(MESSAGES.help, { parse_mode: 'Markdown', reply_markup: MAIN_MENU_KEYBOARD });
      return;
    }
    const handled = await handlePaymentReference(ctx.chat.id, text);
    if (handled) {
      return;
    }
    if (pendingByChat.has(String(ctx.chat.id))) {
      await ctx.reply(MESSAGES.paymentRefNeeded, { reply_markup: MAIN_MENU_KEYBOARD });
      return;
    }
    await showMainMenu(ctx.chat.id, MESSAGES.unrecognized);
  });

  return {
    async processUpdate(update: Update): Promise<void> {
      try {
        const identity = extractFrom(update);
        if (identity === null) {
          logger.info('telegram update ignored', {
            botId: context.botConnection.id,
            update_id: update.update_id,
            type: updateType(update),
          });
          return;
        }
        if (markProcessed(context.botConnection.id, update.update_id)) {
          logger.info('telegram duplicate update skipped', {
            botId: context.botConnection.id,
            update_id: update.update_id,
            type: updateType(update),
          });
          return;
        }
        customer = await getOrCreateCustomer(context.supabase, context.botConnection.id, identity.user, identity.chatId);
        if (customer.isBlocked) {
          await bot.api.sendMessage(identity.chatId, MESSAGES.blocked);
          return;
        }
        logger.info('telegram update processing', {
          botId: context.botConnection.id,
          update_id: update.update_id,
          type: updateType(update),
        });
        await bot.handleUpdate(update);
        if (context.botConnection.id !== OWNER_STORE_BOT_ID) {
          await updateBotHealth(context.supabase, context.botConnection.id);
        }
      } catch (error: unknown) {
        logger.error('telegram processUpdate failed', {
          botId: context.botConnection.id,
          update_id: update.update_id,
          message: error instanceof Error ? error.message : 'unknown',
        });
        const identity = extractFrom(update);
        if (identity !== null) {
          try {
            await bot.api.sendMessage(identity.chatId, MESSAGES.error, { reply_markup: MAIN_MENU_KEYBOARD });
          } catch {
            logger.error('telegram error reply failed', { botId: context.botConnection.id });
          }
        }
      }
    },
  };
}

/**
 * Returns a Telegram client that logs instead of sending.
 *
 * @returns Sandbox TelegramClient
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
 */
export function createGrammyBot(token: string): Bot {
  return new Bot(token);
}
