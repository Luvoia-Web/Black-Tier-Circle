/**
 * @file integrations/telegram/client.ts
 *
 * Telegram store bot. One engine per webhook update.
 * Customers browse the reseller's listings (or the owner catalog), pay, and receive delivery in chat.
 *
 * @module Telegram
 */

import { createHash } from 'node:crypto';
import { Bot, InlineKeyboard } from 'grammy';
import { resolveBotContext, type BotContext } from './bot-context';
import { sendFileDelivery as sendFileDeliveryMessage, sendTextDelivery as sendTextDeliveryMessage } from './delivery';
import type { BotEngine, BotEngineContext, TelegramClient, TelegramSendMessageParams, Update } from './types';
import { withCache } from '@/lib/cache';
import { listProductsByIds } from '@/lib/lookups';
import { PAYMENT_CONFIG } from '@/lib/payment-config';
import { AppError } from '@/lib/errors';
import { getAppUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { formatUsdt } from '@/lib/money';
import { OWNER_STORE_BOT_ID } from '@/lib/owner-bot';
import { sanitizeForTelegram, sanitizeInput } from '@/lib/sanitize';
import { BINANCE_NUMERIC_ORDER_ID_REGEX, TX_HASH_REGEX } from '@/lib/validations/payments';
import { getCustomerById, getOrCreateCustomer, updateBotHealth } from '@/modules/bots';
import type { CustomerRecord } from '@/modules/bots/types';
import { getProduct, listProducts } from '@/modules/catalog';
import type { Product } from '@/modules/catalog/types';
import { cancelOrder, createOrder, getOrder, listOrders } from '@/modules/orders';
import type { Order } from '@/modules/orders/types';
import { createBinancePayOrder, verifyBep20Claim, verifyBinancePayClaim } from '@/modules/payments';
import { listResellerListings } from '@/modules/pricing';
import { getTenantById } from '@/modules/tenants';
import { redeemCustomerCreditToken, redeemTopupToken } from '@/modules/wallet';

export type { TelegramChatId, TelegramClient, TelegramSendMessageParams } from './types';
export type { BotEngine, BotEngineContext };

const processedUpdateIds = new Set<string>();
const PROCESSED_UPDATE_LIMIT = 5000;
const botInfoMemory = new Map<string, ReturnType<typeof buildBotInfo>>();
const PRODUCT_CACHE_MS = 30_000;
const KNOWN_COMMANDS = new Set(['/start', '/shop', '/orders', '/wallet', '/deposit', '/support']);

const ERROR_TEXT: Record<string, string> = {
  INSUFFICIENT_FUNDS: '❌ This store cannot complete that purchase right now\\. Please try again later or contact support\\.',
  INSUFFICIENT_AVAILABLE_FUNDS:
    '❌ This store cannot complete that purchase right now\\. Please try again later or contact support\\.',
  OUT_OF_STOCK: '❌ Sorry, this product is out of stock\\.',
  PRODUCT_NOT_AVAILABLE: '❌ This product is not available right now\\.',
  TOKEN_NOT_FOUND: '❌ Invalid token\\. Please check and try again\\.',
  TOKEN_REDEEMED: '❌ This token has already been used\\.',
  TOKEN_EXPIRED: '❌ This token has expired\\.',
  TOKEN_REVOKED: '❌ This token is no longer valid\\.',
  WALLET_NOT_FOUND: '❌ Wallet not found\\. Contact support\\.',
  PAYMENT_VERIFICATION_FAILED: '❌ Payment not verified\\. Please check your transaction and try again\\.',
  ORDER_NOT_FOUND: '❌ Order not found\\. Use /orders to see your orders\\.',
  ORDER_NOT_PAYABLE: '❌ This order is not waiting for payment\\.',
  DEFAULT: '⚠️ Something went wrong\\. Please try again or contact /support',
};

type CatalogItem = {
  readonly product: Product;
  readonly priceMinor: bigint;
};

type Screen = {
  readonly chatId: string | number;
  readonly messageId?: number;
};

function md(text: string): string {
  return sanitizeForTelegram(text, 3500);
}

function html(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildBotInfo(id: number, username: string) {
  const name = username.length > 0 ? username : 'store';
  return {
    id,
    is_bot: true as const,
    first_name: name,
    username: name,
    can_join_groups: true as const,
    can_read_all_group_messages: false as const,
    supports_inline_queries: false as const,
    can_connect_to_business: false as const,
    has_main_web_app: false as const,
    has_topics_enabled: false as const,
    allows_users_to_create_topics: false as const,
    can_manage_bots: false as const,
    supports_join_request_queries: false as const,
  };
}

function rememberedBotInfo(botConnectionId: string, telegramBotId: string, username: string) {
  const telegramId = Number(telegramBotId);
  if (Number.isInteger(telegramId) && telegramId > 0) {
    return buildBotInfo(telegramId, username);
  }
  return botInfoMemory.get(botConnectionId);
}

function money(minor: bigint): string {
  return md(formatUsdt(minor));
}

function orderRef(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

function categoryKey(name: string): string {
  return createHash('sha256').update(name).digest('hex').slice(0, 12);
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function botError(code: string): string {
  return ERROR_TEXT[code] ?? '⚠️ Something went wrong\\. Please try again or contact /support';
}

function friendly(error: unknown): string {
  const code = error instanceof AppError ? error.code : 'DEFAULT';
  return botError(code);
}

function deliveryLabel(product: Product): string {
  if (product.deliveryType === 'file_reusable') {
    return 'File';
  }
  if (product.deliveryType === 'inventory_unit') {
    return 'License key';
  }
  if (product.deliveryType === 'supplier_api') {
    return 'Instant';
  }
  return 'Manual';
}

function stockPhrase(product: Product): string {
  if (product.stockUnlimited) {
    return 'Unlimited';
  }
  const count = product.stockCount ?? 0;
  return count <= 0 ? 'Sold out' : `${count} units available`;
}

function soldOut(product: Product): boolean {
  return !product.stockUnlimited && (product.stockCount ?? 0) <= 0;
}

function statusEmoji(status: string): string {
  if (status === 'verified' || status === 'ready' || status === 'sent' || status === 'debited') {
    return '✅';
  }
  if (status === 'failed' || status === 'canceled' || status === 'unreachable') {
    return '❌';
  }
  if (status === 'pending_verification') {
    return '🔍';
  }
  if (status === 'not_ready') {
    return '⏸';
  }
  if (status === 'manual_pending' || status === 'supplier_pending') {
    return '🔄';
  }
  return '⏳';
}

function homeKeyboard(store: BotContext): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text('🛍 Browse Shop', 'shop:')
    .text('💰 My Wallet', 'wallet:')
    .row()
    .text('📦 My Orders', 'orders:')
    .text('👤 Profile', 'profile:')
    .row()
    .text('💳 Deposit', 'deposit:')
    .text('❓ Support', 'support:')
    .row();
  if (store.resellerSignupEnabled) {
    keyboard.text('🤝 Become a Reseller', 'reseller_signup:').row();
  }
  keyboard.text('🔑 Developer API', 'api_info:').text('📜 Terms', 'terms:');
  return keyboard;
}

function navRow(keyboard: InlineKeyboard, backData?: string): InlineKeyboard {
  if (backData) {
    keyboard.text('⬅ Back', backData).text('🏠 Home', 'home:');
    return keyboard;
  }
  keyboard.text('🏠 Home', 'home:');
  return keyboard;
}

async function show(
  bot: Bot,
  screen: Screen,
  text: string,
  keyboard?: InlineKeyboard,
  parseMode: 'MarkdownV2' | 'HTML' = 'MarkdownV2',
): Promise<void> {
  const extra = {
    parse_mode: parseMode,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  };
  if (screen.messageId !== undefined) {
    try {
      await bot.api.editMessageText(screen.chatId, screen.messageId, text, extra);
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('not modified')) {
        return;
      }
    }
  }
  await bot.api.sendMessage(screen.chatId, text, extra);
}

function welcomeText(store: BotContext, balanceMinor: bigint): string {
  return (
    `👋 <b>Welcome to ${html(store.storeName)}!</b>\n\n` +
    `🛒 Browse products, pay, and get delivery in this chat.\n\n` +
    `💰 Balance: <b>${html(formatUsdt(balanceMinor))}</b>\n\n` +
    `Choose an option below:`
  );
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
  const knownInfo = rememberedBotInfo(
    context.botConnection.id,
    context.botConnection.telegramBotId,
    context.botConnection.username,
  );
  const knownBot = knownInfo !== undefined;
  const bot = new Bot(botToken, knownInfo ? { botInfo: knownInfo } : undefined);
  let customer: CustomerRecord | null = null;
  let store: BotContext | null = null;

  async function storeContext(): Promise<BotContext> {
    if (store === null) {
      store = await resolveBotContext(context.supabase, context.botConnection.id, context.tenantId);
    }
    return store;
  }

  async function loadCatalog(): Promise<CatalogItem[]> {
    const cacheKey = `bot_products_${context.botConnection.id}`;
    return withCache(cacheKey, PRODUCT_CACHE_MS, async () => {
      if (context.tenantId === null) {
        const products = await listProducts(context.supabase, { status: 'published' });
        return products.map((product) => ({ product, priceMinor: product.retailPriceMinor }));
      }
      const listings = await listResellerListings(context.supabase, context.tenantId);
      return listings
        .filter((listing) => listing.isVisible && listing.product.status === 'published')
        .map((listing) => ({ product: listing.product, priceMinor: listing.retailPriceMinor }));
    });
  }

  async function maintenanceBlock(screen: Screen): Promise<boolean> {
    const current = await storeContext();
    if (current.storeStatus !== 'maintenance') {
      return false;
    }
    await show(
      bot,
      screen,
      `🔧 *Store Temporarily Closed*\n\n${md(current.maintenanceMessage)}\n\nThank you for your patience\\.`,
      new InlineKeyboard().text('❓ Support', 'support:').text('🏠 Home', 'home:'),
    );
    return true;
  }

  async function showHome(screen: Screen): Promise<void> {
    const current = await storeContext();
    const balance = customer?.creditBalanceMinor ?? 0n;
    await show(bot, screen, welcomeText(current, balance), homeKeyboard(current), 'HTML');
  }

  async function showShop(screen: Screen, categoryToken?: string): Promise<void> {
    if (await maintenanceBlock(screen)) {
      return;
    }
    const current = await storeContext();
    const catalog = await loadCatalog();
    if (catalog.length === 0) {
      await show(
        bot,
        screen,
        `😔 *No products available right now*\n\nCheck back soon\\!`,
        new InlineKeyboard().text('🏠 Home', 'home:'),
      );
      return;
    }
    const categories = [...new Set(catalog.map((item) => item.product.category).filter((value): value is string => Boolean(value)))];
    if (!categoryToken && categories.length > 1) {
      const keyboard = new InlineKeyboard();
      for (const category of categories) {
        keyboard.text(clip(category, 40), `cat:${categoryKey(category)}`).row();
      }
      keyboard.text('🏠 Home', 'home:');
      await show(
        bot,
        screen,
        `🛍 *Browse Shop*\n\n${md(current.storeName)} — ${catalog.length} products\n\nChoose a category:`,
        keyboard,
      );
      return;
    }
    const visible =
      categoryToken === undefined
        ? catalog
        : catalog.filter((item) => item.product.category !== null && categoryKey(item.product.category) === categoryToken);
    const keyboard = new InlineKeyboard();
    for (const item of visible) {
      const price = formatUsdt(item.priceMinor).replace(' USDT', '');
      const stock = item.product.stockUnlimited ? '∞' : soldOut(item.product) ? 'sold out' : `${item.product.stockCount ?? 0} left`;
      const label = clip(`${soldOut(item.product) ? '❌' : '📦'} ${item.product.title} — ${price} USDT (${stock})`, 64);
      keyboard.text(label, soldOut(item.product) ? 'sold:' : `product:${item.product.id}`).row();
    }
    if (categories.length > 1) {
      keyboard.text('⬅ Categories', 'shop:');
    }
    keyboard.text('🏠 Home', 'home:');
    await show(
      bot,
      screen,
      `🛍 *Browse Shop*\n\n${md(current.storeName)} — ${visible.length} products\n\nSelect a product:`,
      keyboard,
    );
  }

  async function showProduct(screen: Screen, productId: string): Promise<void> {
    if (await maintenanceBlock(screen)) {
      return;
    }
    const catalog = await loadCatalog();
    const item = catalog.find((entry) => entry.product.id === productId);
    if (!item) {
      await show(bot, screen, ERROR_TEXT.PRODUCT_NOT_AVAILABLE ?? ERROR_TEXT.DEFAULT ?? '', homeKeyboard(await storeContext()));
      return;
    }
    const product = item.product;
    const minutes = product.estimatedDeliveryMinutes;
    const text =
      `📦 *${md(product.title)}*\n\n` +
      `${md(product.description ?? 'No description.')}\n\n` +
      `💵 Price: *${money(item.priceMinor)}*\n` +
      `📦 Stock: ${md(stockPhrase(product))}\n` +
      `⏱ Delivery: ${minutes ? md(`~${minutes} minutes`) : 'Instant'}\n` +
      `📂 Type: ${md(deliveryLabel(product))}`;
    const keyboard = new InlineKeyboard();
    if (soldOut(product) || product.status !== 'published') {
      keyboard.text('❌ Out of Stock', 'sold:').row();
    } else {
      keyboard.text('🛒 Buy Now', `buy:${product.id}`).row();
    }
    keyboard.text('⬅ Back to Shop', 'shop:').text('🏠 Home', 'home:');
    await show(bot, screen, text, keyboard);
  }

  function paymentKeyboard(current: BotContext, orderId: string): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    if (current.binancePayEnabled) {
      keyboard.text('💳 Pay with Binance Pay', `pay_bp:${orderId}`).row();
    }
    if (current.bep20Enabled && current.usdtWalletAddress) {
      keyboard.text('📤 Send USDT (BEP20)', `pay_bep:${orderId}`).row();
    }
    if (current.isDemoMode) {
      keyboard.text('🧪 Demo Payment (Test Mode)', `pay_demo:${orderId}`).row();
    }
    keyboard.text('❌ Cancel Order', `cancel_order:${orderId}`);
    return keyboard;
  }

  async function showPaymentOptions(screen: Screen, order: Order, productTitle: string): Promise<void> {
    const current = await storeContext();
    const text =
      `✅ *Order Placed\\!*\n\n` +
      `📦 ${md(productTitle)}\n` +
      `💵 Amount: *${money(order.quotedRetailPriceMinor)}*\n` +
      `🔖 Order: \`${orderRef(order.id)}\`\n\n` +
      `Choose how you'd like to pay:`;
    await show(bot, screen, text, paymentKeyboard(current, order.id));
  }

  async function handleBuy(screen: Screen, productId: string, updateId: number): Promise<void> {
    if (await maintenanceBlock(screen)) {
      return;
    }
    if (customer === null) {
      throw new Error('missing customer');
    }
    const catalog = await loadCatalog();
    const item = catalog.find((entry) => entry.product.id === productId);
    if (!item || soldOut(item.product)) {
      await show(bot, screen, ERROR_TEXT.OUT_OF_STOCK ?? ERROR_TEXT.DEFAULT ?? '', homeKeyboard(await storeContext()));
      return;
    }
    try {
      const order = await createOrder(context.supabase, {
        channel: context.tenantId === null ? 'owner_store' : 'reseller_bot',
        ...(context.tenantId !== null ? { tenantId: context.tenantId } : {}),
        botId: context.botConnection.id,
        customerId: customer.id,
        productId,
        idempotencyKey: `tg:${context.botConnection.id}:${updateId}:${productId}`,
      });
      await showPaymentOptions(screen, order, item.product.title);
    } catch (error: unknown) {
      await show(bot, screen, friendly(error), homeKeyboard(await storeContext()));
    }
  }

  async function ownedOrder(orderId: string): Promise<Order | null> {
    if (customer === null) {
      return null;
    }
    try {
      const order = await getOrder(context.supabase, orderId);
      return order.customerId === customer.id ? order : null;
    } catch {
      return null;
    }
  }

  async function latestPayableOrder(): Promise<Order | null> {
    if (customer === null) {
      return null;
    }
    const orders = await listOrders(context.supabase, { customerId: customer.id, limit: 10 });
    return (
      orders.find((order) => order.paymentStatus === 'awaiting' || order.paymentStatus === 'pending_verification') ??
      null
    );
  }

  async function confirmed(screen: Screen, order: Order): Promise<void> {
    const product = await getProduct(context.supabase, order.productId);
    const minutes = product.estimatedDeliveryMinutes;
    await show(
      bot,
      screen,
      `✅ *Payment Confirmed\\!*\n\n` +
        `📦 ${md(product.title)}\n` +
        `💵 ${money(order.quotedRetailPriceMinor)}\n` +
        `🔖 Order: \`${orderRef(order.id)}\`\n\n` +
        `Your order is being prepared\\.\n` +
        `${minutes ? `⏱ Estimated delivery: ~${minutes} minutes` : 'Delivery is in progress\\.'}\n\n` +
        `You will receive your product in this chat shortly\\.`,
      new InlineKeyboard().text('📦 My Orders', 'orders:').text('🏠 Home', 'home:'),
    );
  }

  async function startBinance(screen: Screen, orderId: string): Promise<void> {
    const order = await ownedOrder(orderId);
    if (!order) {
      await show(bot, screen, ERROR_TEXT.ORDER_NOT_FOUND ?? '', homeKeyboard(await storeContext()));
      return;
    }
    const checkout = await createBinancePayOrder(context.supabase, order.id);
    const keyboard = new InlineKeyboard()
      .url('Open Binance Pay', checkout.checkoutUrl)
      .row()
      .text('❌ Cancel Order', `cancel_order:${order.id}`);
    await show(
      bot,
      screen,
      `💳 *Binance Pay*\n\n` +
        `Amount: *${money(order.quotedRetailPriceMinor)}*\n` +
        `Order: \`${orderRef(order.id)}\`\n\n` +
        `Open Binance Pay, then send your *Binance Pay Order ID* here\\.`,
      keyboard,
    );
  }

  async function startBep20(screen: Screen, orderId: string): Promise<void> {
    const current = await storeContext();
    const order = await ownedOrder(orderId);
    const address = current.usdtWalletAddress;
    if (!order || !address) {
      await show(bot, screen, ERROR_TEXT.ORDER_NOT_FOUND ?? '', homeKeyboard(current));
      return;
    }
    const keyboard = new InlineKeyboard()
      .text('📋 Copy Address', 'copy_addr:')
      .row()
      .text('❌ Cancel Order', `cancel_order:${order.id}`);
    await show(
      bot,
      screen,
      `📤 *Send USDT \\(BEP20\\)*\n\n` +
        `Send exactly:\n*${money(order.quotedRetailPriceMinor)}* on BEP20\n\n` +
        `To this address:\n\`${md(address)}\`\n\n` +
        `⚠️ Send the EXACT amount\\.\n` +
        `After sending, reply with your transaction hash \\(0x and 64 characters\\)\\.\n\n` +
        `Order: \`${orderRef(order.id)}\`\n` +
        `⏰ Expires in 24 hours`,
      keyboard,
    );
  }

  async function startDemo(screen: Screen, orderId: string): Promise<void> {
    const order = await ownedOrder(orderId);
    if (!order) {
      await show(bot, screen, ERROR_TEXT.ORDER_NOT_FOUND ?? '', homeKeyboard(await storeContext()));
      return;
    }
    await show(
      bot,
      screen,
      `🧪 *Demo Mode \\- Test Payment*\n\n` +
        `⚠️ This is a TEST environment\\.\n` +
        `No real payment is required\\.\n\n` +
        `Order: \`${orderRef(order.id)}\``,
      new InlineKeyboard()
        .text('✅ Simulate Payment Success', `pay_demo_confirm:${order.id}`)
        .row()
        .text('❌ Cancel Order', `cancel_order:${order.id}`),
    );
  }

  async function confirmDemo(screen: Screen, orderId: string): Promise<void> {
    const current = await storeContext();
    if (!current.isDemoMode) {
      await show(bot, screen, ERROR_TEXT.DEFAULT ?? '', homeKeyboard(current));
      return;
    }
    const order = await ownedOrder(orderId);
    if (!order) {
      await show(bot, screen, ERROR_TEXT.ORDER_NOT_FOUND ?? '', homeKeyboard(current));
      return;
    }
    await show(bot, screen, `⏳ Verifying your payment\\.\\.\\.`);
    await createBinancePayOrder(context.supabase, order.id);
    const result = await verifyBinancePayClaim(context.supabase, {
      orderId: order.id,
      binanceOrderId: order.id.replaceAll('-', ''),
    });
    if (result.verified) {
      await confirmed(screen, order);
      return;
    }
    await show(
      bot,
      screen,
      `❌ *Payment Not Verified*\n\n${md(result.rejectReason ?? 'Verification failed')}`,
      paymentKeyboard(current, order.id),
    );
  }

  async function verifyReference(screen: Screen, text: string): Promise<boolean> {
    const trimmed = text.trim();
    const isHash = TX_HASH_REGEX.test(trimmed) || trimmed.startsWith(PAYMENT_CONFIG.demo.failTxPrefix);
    const isBinance =
      BINANCE_NUMERIC_ORDER_ID_REGEX.test(trimmed) ||
      trimmed.startsWith(PAYMENT_CONFIG.demo.successPrefix) ||
      trimmed.startsWith(PAYMENT_CONFIG.demo.failPrefix);
    if (!isHash && !isBinance) {
      return false;
    }
    const order = await latestPayableOrder();
    if (!order) {
      await show(bot, screen, `No pending order found\\. Use /orders to check your orders\\.`, homeKeyboard(await storeContext()));
      return true;
    }
    await show(bot, screen, isHash ? `⏳ Verifying your transaction on the blockchain\\.\\.\\.` : `⏳ Verifying your Binance Pay payment\\.\\.\\.`);
    if ((await storeContext()).isDemoMode) {
      await new Promise((resolve) => {
        setTimeout(resolve, PAYMENT_CONFIG.demo.verificationDelayMs);
      });
    }
    try {
      const result = isHash
        ? await verifyBep20Claim(context.supabase, { orderId: order.id, txHash: trimmed })
        : await verifyBinancePayClaim(context.supabase, { orderId: order.id, binanceOrderId: trimmed });
      if (result.verified) {
        await confirmed(screen, order);
        return true;
      }
      await show(
        bot,
        screen,
        `❌ *Payment Not Verified*\n\n${md(result.rejectReason ?? 'Verification failed')}\n\nPlease try again\\.`,
        paymentKeyboard(await storeContext(), order.id),
      );
    } catch (error: unknown) {
      await show(bot, screen, friendly(error), homeKeyboard(await storeContext()));
    }
    return true;
  }

  function tokenHtml(code: string | undefined): string {
    if (code === 'TOKEN_NOT_FOUND') {
      return '❌ <b>Invalid token</b>\n\nThis token does not exist. Please check and try again.';
    }
    if (code === 'TOKEN_REDEEMED') {
      return '❌ <b>Token already used</b>\n\nThis token has already been redeemed.';
    }
    if (code === 'TOKEN_EXPIRED') {
      return '❌ <b>Token expired</b>\n\nThis token is no longer valid.';
    }
    if (code === 'TOKEN_REVOKED') {
      return '❌ <b>Token revoked</b>\n\nThis token is no longer valid.';
    }
    if (code === 'TOKEN_IS_STORE_WALLET' || code === 'TOKEN_WRONG_TENANT') {
      return '❌ <b>Store wallet token</b>\n\nThis token funds a reseller store wallet. Ask your store owner for a customer top-up token.';
    }
    return '❌ Failed to credit balance. Please contact support.';
  }

  async function redeemToken(screen: Screen, token: string): Promise<void> {
    if (customer === null) {
      throw new Error('missing customer');
    }
    await show(bot, screen, '⏳ Verifying token...', undefined, 'HTML');
    const credit = await redeemCustomerCreditToken(context.supabase, token, customer.id);
    if (credit.errorCode === 'TOKEN_IS_STORE_WALLET' && context.tenantId !== null && credit.storeTenantId === context.tenantId) {
      const tenant = await getTenantById(context.supabase, context.tenantId);
      const result = await redeemTopupToken(context.supabase, token, context.tenantId, tenant.ownerUserId);
      if (!result.success || result.amountCredited === undefined || result.newBalance === undefined) {
        await show(bot, screen, tokenHtml(result.errorCode), homeKeyboard(await storeContext()), 'HTML');
        return;
      }
      await show(
        bot,
        screen,
        `✅ <b>Token Redeemed!</b>\n\n` +
          `Added: <b>+${html(formatUsdt(result.amountCredited))}</b>\n` +
          `New store balance: <b>${html(formatUsdt(result.newBalance))}</b>`,
        new InlineKeyboard().text('🏠 Home', 'home:').text('🛍 Shop Now', 'shop:'),
        'HTML',
      );
      return;
    }
    if (!credit.success || credit.amountCredited === undefined || credit.newBalance === undefined) {
      await show(bot, screen, tokenHtml(credit.errorCode), homeKeyboard(await storeContext()), 'HTML');
      return;
    }
    customer = { ...customer, creditBalanceMinor: credit.newBalance };
    await show(
      bot,
      screen,
      `✅ <b>Token Redeemed!</b>\n\n` +
        `Added: <b>+${html(formatUsdt(credit.amountCredited))}</b>\n` +
        `New Balance: <b>${html(formatUsdt(credit.newBalance))}</b>\n\n` +
        `Your funds are ready to use. Tap below to browse products!`,
      new InlineKeyboard().text('🛍 Browse Shop', 'shop:').text('💰 My Wallet', 'wallet:'),
      'HTML',
    );
  }

  async function showWallet(screen: Screen): Promise<void> {
    if (customer === null) {
      throw new Error('missing customer');
    }
    const fresh = await getCustomerById(context.supabase, customer.id);
    customer = fresh;
    const balance = fresh.creditBalanceMinor;
    const orders = await listOrders(context.supabase, { customerId: customer.id, limit: 5 });
    const paid = orders.filter((order) => order.paymentStatus === 'verified');
    const products = await listProductsByIds(
      context.supabase,
      paid.map((order) => order.productId),
    );
    let text = `💰 <b>My Wallet</b>\n\nBalance: <b>${html(formatUsdt(balance))}</b>\n\n`;
    if (paid.length > 0) {
      text += `<b>Recent Activity:</b>\n`;
      for (const order of paid) {
        const title = products.get(order.productId)?.title ?? 'Product';
        text += `• ${html(title)} — ${html(formatUsdt(order.quotedRetailPriceMinor))}\n`;
      }
    } else {
      text += `No purchases yet. Browse the shop to get started!`;
    }
    const keyboard = new InlineKeyboard()
      .text('💳 Add Funds', 'deposit:')
      .text('🛍 Shop Now', 'shop:')
      .row()
      .text('🏠 Home', 'home:');
    await show(bot, screen, text, keyboard, 'HTML');
  }

  async function showDeposit(screen: Screen): Promise<void> {
    if (await maintenanceBlock(screen)) {
      return;
    }
    const current = await storeContext();
    const keyboard = new InlineKeyboard().text('🔑 Redeem Top-Up Token', 'dep_token:').row();
    if (current.bep20Enabled && current.usdtWalletAddress) {
      keyboard.text('📤 Send USDT (BEP20)', 'dep_bep20:').row();
    }
    if (current.binancePayEnabled) {
      keyboard.text('💳 Binance Pay', 'dep_bp:').row();
    }
    keyboard.text('⬅ Back', 'wallet:');
    await show(
      bot,
      screen,
      `💳 <b>Add Funds</b>\n\nChoose how to add funds to your wallet:`,
      keyboard,
      'HTML',
    );
  }

  async function showOrders(screen: Screen): Promise<void> {
    if (customer === null) {
      throw new Error('missing customer');
    }
    const orders = await listOrders(context.supabase, { customerId: customer.id, limit: 10 });
    if (orders.length === 0) {
      await show(
        bot,
        screen,
        `📭 *No Orders Yet*\n\nYou haven't placed any orders yet\\.`,
        new InlineKeyboard().text('🛍 Browse Shop', 'shop:').text('🏠 Home', 'home:'),
      );
      return;
    }
    const products = await listProductsByIds(
      context.supabase,
      orders.map((order) => order.productId),
    );
    const keyboard = new InlineKeyboard();
    for (const order of orders) {
      const product = products.get(order.productId);
      const title = product?.title ?? 'Product';
      const mark = statusEmoji(order.paymentStatus === 'verified' ? order.deliveryStatus : order.paymentStatus);
      keyboard
        .text(
          clip(`${mark} #${orderRef(order.id)} — ${title} — ${formatUsdt(order.quotedRetailPriceMinor)}`, 64),
          `order:${order.id}`,
        )
        .row();
    }
    keyboard.text('🏠 Home', 'home:');
    await show(bot, screen, `📦 *Your Orders*\n\nHere are your recent orders:`, keyboard);
  }

  async function showOrder(screen: Screen, orderId: string): Promise<void> {
    const order = await ownedOrder(orderId);
    if (!order) {
      await show(bot, screen, ERROR_TEXT.ORDER_NOT_FOUND ?? '', homeKeyboard(await storeContext()));
      return;
    }
    const product = await getProduct(context.supabase, order.productId);
    const when = order.createdAt.toISOString().slice(0, 16).replace('T', ' ');
    const text =
      `📦 *Order Details*\n\n` +
      `🔖 Order ID: \`${orderRef(order.id)}\`\n` +
      `📦 Product: ${md(product.title)}\n` +
      `💵 Amount: ${money(order.quotedRetailPriceMinor)}\n` +
      `📅 Date: ${md(when)} UTC\n\n` +
      `💳 Payment: ${statusEmoji(order.paymentStatus)} ${md(order.paymentStatus)}\n` +
      `💼 Funding: ${statusEmoji(order.fundingStatus)} ${md(order.fundingStatus)}\n` +
      `📦 Fulfillment: ${statusEmoji(order.fulfillmentStatus)} ${md(order.fulfillmentStatus)}\n` +
      `🚀 Delivery: ${statusEmoji(order.deliveryStatus)} ${md(order.deliveryStatus)}`;
    const keyboard = new InlineKeyboard();
    if (order.paymentStatus === 'awaiting' || order.paymentStatus === 'pending_verification') {
      keyboard.text('💳 Complete Payment', `pay_menu:${order.id}`).row();
    }
    keyboard.text('⬅ Back to Orders', 'orders:').text('🏠 Home', 'home:');
    await show(bot, screen, text, keyboard);
  }

  async function showProfile(screen: Screen): Promise<void> {
    if (customer === null) {
      throw new Error('missing customer');
    }
    const orders = await listOrders(context.supabase, { customerId: customer.id, limit: 50 });
    const completed = orders.filter((order) => order.deliveryStatus === 'sent');
    const spent = completed.reduce((sum, order) => sum + order.quotedRetailPriceMinor, 0n);
    const name = customer.firstName ?? 'Not set';
    const username = customer.username ? `@${customer.username}` : 'Not set';
    const joined = customer.createdAt.toISOString().slice(0, 10);
    await show(
      bot,
      screen,
      `👤 *Your Profile*\n\n` +
        `Name: ${md(name)}\n` +
        `Username: ${md(username)}\n` +
        `Member since: ${md(joined)}\n\n` +
        `📊 *Your Stats*\n` +
        `Total Orders: ${orders.length}\n` +
        `Completed: ${completed.length}\n` +
        `Total Spent: ${money(spent)}`,
      new InlineKeyboard().text('📦 My Orders', 'orders:').text('💰 My Wallet', 'wallet:').row().text('🏠 Home', 'home:'),
    );
  }

  async function showSupport(screen: Screen): Promise<void> {
    const current = await storeContext();
    const contact = current.supportContact ? `Contact: ${md(current.supportContact)}\n` : '';
    const telegram = current.supportTelegramUrl ? `Telegram: ${md(current.supportTelegramUrl)}\n` : '';
    await show(
      bot,
      screen,
      `❓ *Support*\n\n${contact}${telegram}\nInclude your *Order ID* when asking about an order\\.\nUse /orders to find it\\.`,
      new InlineKeyboard().text('📦 My Orders', 'orders:').text('🏠 Home', 'home:'),
    );
  }

  async function showTerms(screen: Screen): Promise<void> {
    const current = await storeContext();
    if (!current.termsOfService) {
      await show(bot, screen, `📜 *Terms & Policies*\n\nTerms are not configured yet\\.`, navRow(new InlineKeyboard()));
      return;
    }
    await show(bot, screen, `📜 *Terms & Policies*\n\n${md(current.termsOfService.slice(0, 3000))}`, navRow(new InlineKeyboard()));
  }

  async function showApi(screen: Screen): Promise<void> {
    const origin = getAppUrl();
    await show(
      bot,
      screen,
      `🔑 *Developer API*\n\n` +
        `Integrate this store with the REST API\\.\n\n` +
        `📚 Docs:\n${md(`${origin}/api-docs`)}\n\n` +
        `API keys:\n${md(`${origin}/reseller/settings/api-keys`)}`,
      navRow(new InlineKeyboard()),
    );
  }

  async function showResellerSignup(screen: Screen): Promise<void> {
    const current = await storeContext();
    const pitch = current.resellerSignupMessage ?? 'Join our reseller program and start earning today!';
    const contact = current.supportContact ?? 'Contact support for an invite link';
    await show(
      bot,
      screen,
      `🤝 *Become a Reseller*\n\n${md(pitch)}\n\nTo get started, contact us:\n${md(contact)}`,
      new InlineKeyboard().text('❓ Support', 'support:').text('🏠 Home', 'home:'),
    );
  }

  async function cancel(screen: Screen, orderId: string): Promise<void> {
    const order = await ownedOrder(orderId);
    if (!order) {
      await show(bot, screen, ERROR_TEXT.ORDER_NOT_FOUND ?? '', homeKeyboard(await storeContext()));
      return;
    }
    try {
      await cancelOrder(context.supabase, order.id, 'customer cancelled in telegram');
      await show(bot, screen, `❌ Order \`${orderRef(order.id)}\` was cancelled\\.`, homeKeyboard(await storeContext()));
    } catch (error: unknown) {
      await show(bot, screen, friendly(error), homeKeyboard(await storeContext()));
    }
  }

  async function onCallback(screen: Screen, data: string, updateId: number): Promise<void> {
    if (data === 'home:' || data === 'home') {
      await showHome(screen);
      return;
    }
    if (data === 'shop:' || data === 'shop') {
      await showShop(screen);
      return;
    }
    if (data.startsWith('cat:')) {
      await showShop(screen, data.slice(4));
      return;
    }
    if (data.startsWith('product:')) {
      await showProduct(screen, data.slice('product:'.length));
      return;
    }
    if (data === 'sold:') {
      await show(bot, screen, ERROR_TEXT.OUT_OF_STOCK ?? '', homeKeyboard(await storeContext()));
      return;
    }
    if (data.startsWith('buy:')) {
      await handleBuy(screen, data.slice('buy:'.length), updateId);
      return;
    }
    if (data.startsWith('pay_bp:') || data.startsWith('pay:binance:')) {
      const orderId = data.startsWith('pay_bp:') ? data.slice('pay_bp:'.length) : data.slice('pay:binance:'.length);
      await startBinance(screen, orderId);
      return;
    }
    if (data.startsWith('pay_bep:') || data.startsWith('pay:bep20:')) {
      const orderId = data.startsWith('pay_bep:') ? data.slice('pay_bep:'.length) : data.slice('pay:bep20:'.length);
      await startBep20(screen, orderId);
      return;
    }
    if (data.startsWith('pay_menu:')) {
      const order = await ownedOrder(data.slice('pay_menu:'.length));
      if (!order) {
        await show(bot, screen, ERROR_TEXT.ORDER_NOT_FOUND ?? '', homeKeyboard(await storeContext()));
        return;
      }
      const product = await getProduct(context.supabase, order.productId);
      await showPaymentOptions(screen, order, product.title);
      return;
    }
    if (data.startsWith('pay_demo_confirm:')) {
      await confirmDemo(screen, data.slice('pay_demo_confirm:'.length));
      return;
    }
    if (data.startsWith('pay_demo:')) {
      await startDemo(screen, data.slice('pay_demo:'.length));
      return;
    }
    if (data.startsWith('cancel_order:')) {
      await cancel(screen, data.slice('cancel_order:'.length));
      return;
    }
    if (data === 'orders:' || data === 'orders') {
      await showOrders(screen);
      return;
    }
    if (data.startsWith('order:')) {
      await showOrder(screen, data.slice('order:'.length));
      return;
    }
    if (data === 'wallet:' || data === 'wallet') {
      await showWallet(screen);
      return;
    }
    if (data === 'deposit:' || data === 'deposit') {
      await showDeposit(screen);
      return;
    }
    if (data === 'dep_bep20:' || data === 'dep_bp:') {
      await show(
        bot,
        screen,
        `💳 *Add Funds*\n\nUSDT and Binance Pay are applied to an open order\\.\n\nPlace an order, then send your transaction hash or Binance Pay Order ID in this chat\\.`,
        new InlineKeyboard().text('🛍 Browse Shop', 'shop:').text('📦 My Orders', 'orders:'),
      );
      return;
    }
    if (data === 'dep_token:') {
      await show(
        bot,
        screen,
        `🔑 <b>Redeem Top-Up Token</b>\n\n` +
          `Send your <b>12-digit token</b> now:\n` +
          `(numbers only, e.g. 123456789012)\n\n` +
          `Tokens are provided by your store owner.`,
        new InlineKeyboard().text('❌ Cancel', 'wallet:'),
        'HTML',
      );
      return;
    }
    if (data === 'copy_addr:') {
      const address = (await storeContext()).usdtWalletAddress;
      if (address) {
        await bot.api.sendMessage(screen.chatId, `\`${md(address)}\``, { parse_mode: 'MarkdownV2' });
      }
      return;
    }
    if (data === 'profile:') {
      await showProfile(screen);
      return;
    }
    if (data === 'support:') {
      await showSupport(screen);
      return;
    }
    if (data === 'terms:') {
      await showTerms(screen);
      return;
    }
    if (data === 'api_info:') {
      await showApi(screen);
      return;
    }
    if (data === 'reseller_signup:') {
      await showResellerSignup(screen);
      return;
    }
    await showHome(screen);
  }

  async function onText(screen: Screen, text: string): Promise<void> {
    const trimmed = text.trim();
    if (trimmed === '🛍 Browse Products' || trimmed === '🛍 Browse Shop') {
      await showShop(screen);
      return;
    }
    if (trimmed === '📦 My Orders') {
      await showOrders(screen);
      return;
    }
    if (trimmed === '❓ Help') {
      await showSupport(screen);
      return;
    }
    if (/^\d{12}$/.test(trimmed) && !trimmed.startsWith('0')) {
      await redeemToken(screen, trimmed);
      return;
    }
    const handled = await verifyReference(screen, trimmed);
    if (handled) {
      return;
    }
    if (trimmed.startsWith('/')) {
      const command = trimmed.split(/\s/)[0]?.split('@')[0] ?? '';
      if (KNOWN_COMMANDS.has(command)) {
        return;
      }
    }
    const current = await storeContext();
    await show(bot, screen, `🤔 I didn't understand that\\.\n\nUse the menu below to navigate:`, homeKeyboard(current));
  }

  bot.command('start', async (ctx) => {
    await showHome({ chatId: ctx.chat.id });
  });
  bot.command('shop', async (ctx) => {
    await showShop({ chatId: ctx.chat.id });
  });
  bot.command('orders', async (ctx) => {
    await showOrders({ chatId: ctx.chat.id });
  });
  bot.command('wallet', async (ctx) => {
    await showWallet({ chatId: ctx.chat.id });
  });
  bot.command('deposit', async (ctx) => {
    await showDeposit({ chatId: ctx.chat.id });
  });
  bot.command('support', async (ctx) => {
    await showSupport({ chatId: ctx.chat.id });
  });

  bot.on('callback_query:data', async (ctx) => {
    const chatId = ctx.chat?.id ?? ctx.from.id;
    const message = ctx.callbackQuery.message;
    const messageId = message && 'message_id' in message ? message.message_id : undefined;
    await onCallback({ chatId, ...(messageId !== undefined ? { messageId } : {}) }, ctx.callbackQuery.data, ctx.update.update_id);
  });

  bot.on('message:text', async (ctx) => {
    await onText({ chatId: ctx.chat.id }, ctx.message.text);
  });

  return {
    async sendFileDelivery(chatId: string, signedUrl: string, productTitle: string): Promise<void> {
      await sendFileDeliveryMessage(botToken, chatId, signedUrl, productTitle);
    },
    async sendTextDelivery(chatId: string, message: string): Promise<void> {
      await sendTextDeliveryMessage(botToken, chatId, message);
    },
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
        if (update.callback_query) {
          try {
            await bot.api.answerCallbackQuery(update.callback_query.id);
          } catch (error: unknown) {
            logger.info('telegram callback answer skipped', {
              botId: context.botConnection.id,
              message: error instanceof Error ? error.message : 'unknown',
            });
          }
        }
        const [loadedCustomer, loadedStore] = await Promise.all([
          getOrCreateCustomer(context.supabase, context.botConnection.id, identity.user, identity.chatId),
          resolveBotContext(context.supabase, context.botConnection.id, context.tenantId),
          loadCatalog().catch((error: unknown) => {
            logger.info('telegram catalog prefetch skipped', {
              botId: context.botConnection.id,
              message: error instanceof Error ? error.message : 'unknown',
            });
            return [];
          }),
        ]);
        customer = loadedCustomer;
        store = loadedStore;
        if (customer.isBlocked) {
          await bot.api.sendMessage(identity.chatId, '🚫 Your account has been blocked\\. Contact support for assistance\\.', {
            parse_mode: 'MarkdownV2',
          });
          return;
        }
        logger.info('telegram update processing', {
          botId: context.botConnection.id,
          update_id: update.update_id,
          type: updateType(update),
        });
        if (!knownBot) {
          await bot.init();
          if (bot.botInfo) {
            botInfoMemory.set(
              context.botConnection.id,
              buildBotInfo(bot.botInfo.id, bot.botInfo.username ?? context.botConnection.username),
            );
          }
        }
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
            await bot.api.sendMessage(identity.chatId, ERROR_TEXT.DEFAULT ?? '⚠️ Something went wrong.', {
              parse_mode: 'MarkdownV2',
            });
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
