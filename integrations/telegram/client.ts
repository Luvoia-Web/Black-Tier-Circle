/**
 * @file integrations/telegram/client.ts
 *
 * Telegram store bot. One engine per webhook update.
 * Customers browse the reseller's listings (or the owner catalog), pay, and receive delivery in chat.
 *
 * @module Telegram
 */

import { Bot, InlineKeyboard } from 'grammy';
import { resolveBotContextCached, type BotContext } from './bot-context';
import { telegramSetMyCommands } from './api';
import { sendFileDelivery as sendFileDeliveryMessage, sendTextDelivery as sendTextDeliveryMessage } from './delivery';
import type { BotEngine, BotEngineContext, TelegramClient, TelegramSendMessageParams, Update } from './types';
import { withCache } from '@/lib/cache';
import { listProductsByIds } from '@/lib/lookups';
import { BOT_ERRORS } from '@/lib/bot-errors';
import { PAYMENT_CONFIG, buyerCheckoutMethods, buyerTrc20Visible, loadPaymentConfig, paymentSandboxEnabled } from '@/lib/payment-config';
import { AppError, ValidationError } from '@/lib/errors';
import { getAppUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { formatUsdt } from '@/lib/money';
import { OWNER_STORE_BOT_ID } from '@/lib/owner-bot';
import { checkRateLimit } from '@/lib/rate-limiter';
import { normalizeEthAddress } from '@/integrations/bsc/verify';
import { claimWalletTopup, findOpenTopup, openWalletTopup } from '@/modules/topups';
import {
  parseTopupAmount,
  quickTopupAmounts,
  topupAmountPrompt,
  topupClaimText,
  topupInstructions,
} from '@/modules/topups/screens';
import { BINANCE_NUMERIC_ORDER_ID_REGEX, TX_HASH_REGEX } from '@/lib/validations/payments';
import { getCustomerById, openCustomer, updateBotHealth } from '@/modules/bots';
import type { CustomerRecord } from '@/modules/bots/types';
import { getProduct, listProducts } from '@/modules/catalog';
import { loadSoldCounts } from '@/modules/catalog/sold-count';
import {
  BALANCE_ADDED_TEXT,
  BALANCE_EXPIRED_TEXT,
  checkoutButtons,
  checkoutText,
  depositAmountLine,
  topUpAmount,
  layoutScreenButtons,
  productCardButtons,
  productCardText,
  quantityText,
  bulkOfferText,
  bulkSavingsSentence,
  renderShop,
  resolvedWarranty,
  shopProductFrom,
  type ScreenButton,
} from '@/modules/catalog/shop-screen';
import { claimCheckoutResume, markResumeAfterTopup } from '@/modules/orders/balance-notice';
import { layoutHomeButtons } from '@/modules/store-config/keyboard';
import { renderTemplate } from '@/modules/store-config/template';
import { claimFreebie, listFreebies } from '@/modules/referrals/freebies';
import { isReferralCode } from '@/modules/referrals/codes';
import {
  freebieContentText,
  freebieListText,
  friendJoinedText,
  nextFreebieLine,
  redeemConfirmText,
  redeemedText,
  referralHomeText,
  referralLink,
  shareUrl,
} from '@/modules/referrals/screens';
import { attachReferral, ensureReferralCode, redeemPoints, referralSummary } from '@/modules/referrals/store';
import { chargedQuoteDisplay } from '@/modules/pricing/tiers';
import { listBulkTiers, readCostFloor } from '@/modules/pricing/tier-store';
import { normalizeBotUrl } from '@/modules/store-config/urls';
import type { Product } from '@/modules/catalog/types';
import { cancelOrder, getOrder, listOrders, updateOrderQuantity } from '@/modules/orders';
import { CHECKOUT_WINDOW_MS, expireCheckout, isCheckoutExpired, maxOrderQuantity, openCheckoutOrder } from '@/modules/orders/checkout';
import type { Order } from '@/modules/orders/types';
import {
  confirmDemoOrderPayment,
  createBinancePayOrder,
  submitBinanceManualReview,
  payOrderFromCustomerWallet,
  verifyBep20Claim,
  verifyBinancePayClaim,
} from '@/modules/payments';
import { listResellerListings } from '@/modules/pricing';
import { getTenantById } from '@/modules/tenants';
import { redeemCustomerCreditToken, redeemTopupToken } from '@/modules/wallet';

export type { TelegramChatId, TelegramClient, TelegramSendMessageParams } from './types';
export type { BotEngine, BotEngineContext };

const processedUpdateIds = new Set<string>();
const PROCESSED_UPDATE_LIMIT = 5000;
const botInfoMemory = new Map<string, ReturnType<typeof buildBotInfo>>();
const PRODUCT_CACHE_MS = 60_000;
const CUSTOMER_CACHE_MS = 30_000;
const CUSTOMER_CACHE = new Map<string, { data: CustomerRecord; expiresAt: number }>();
const COMMANDS_REFRESH = new Map<string, number>();
const awaitingEmail = new Map<string, { readonly orderId: string; readonly productTitle: string }>();
const awaitingQty = new Map<string, { readonly productId: string; readonly max: number }>();
const pendingTopup = new Map<string, bigint>();
const awaitingTopupHash = new Set<string>();
const awaitingTopupAmount = new Set<string>();
const awaitingBinanceManual = new Map<string, string>();
const awaitingFind = new Set<string>();

function emailKey(botId: string, chatId: string | number): string {
  return `${botId}:${chatId}`;
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
const KNOWN_COMMANDS = new Set([
  '/start',
  '/menu',
  '/shop',
  '/orders',
  '/wallet',
  '/deposit',
  '/support',
  '/profile',
  '/refer',
  '/api',
  '/find',
  '/terms',
]);

const ERROR_TEXT: Record<string, string> = {
  INSUFFICIENT_FUNDS:
    '❌ <b>Store Unavailable</b>\n\nThis store cannot complete that purchase right now. Please try again later or contact /support.',
  INSUFFICIENT_AVAILABLE_FUNDS:
    '❌ <b>Store Unavailable</b>\n\nThis store cannot complete that purchase right now. Please try again later or contact /support.',
  OUT_OF_STOCK: '❌ <b>Out of Stock</b>\n\nThis product is currently unavailable.',
  PRODUCT_NOT_AVAILABLE: '❌ <b>Product Unavailable</b>\n\nThis product is not available right now.',
  TOKEN_NOT_FOUND: '❌ <b>Invalid Token</b>\n\nPlease check it and try again.',
  TOKEN_REDEEMED: '❌ <b>Token Already Used</b>\n\nThis token has already been used.',
  TOKEN_EXPIRED: '❌ <b>Token Expired</b>\n\nThis token has expired.',
  TOKEN_REVOKED: '❌ <b>Token Cancelled</b>\n\nThis token is no longer valid.',
  WALLET_NOT_FOUND: '❌ <b>Wallet Not Found</b>\n\nContact /support.',
  PAYMENT_VERIFICATION_FAILED: '❌ <b>Payment Not Verified</b>\n\nPlease check your transaction and try again.',
  ORDER_NOT_FOUND: '❌ <b>Order Not Found</b>\n\nUse /orders to see your orders.',
  ORDER_NOT_PAYABLE: '❌ <b>Order Not Payable</b>\n\nThis order is not waiting for payment.',
  DEFAULT: '⚠️ <b>Something went wrong</b>\n\nPlease try again or contact /support.',
};

type CatalogItem = {
  readonly product: Product;
  readonly priceMinor: bigint;
  readonly soldCount: number | null;
};

type Screen = {
  readonly chatId: string | number;
  readonly messageId?: number;
};

function escHtml(text: string): string {
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
  return formatUsdt(minor);
}

function orderRef(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function soldOut(product: Product): boolean {
  return !product.stockUnlimited && (product.stockCount ?? 0) <= 0;
}

function customerFacingStatus(order: Order): string {
  if (order.paymentStatus === 'awaiting' || order.paymentStatus === 'pending_verification') {
    return '⏳ Awaiting Payment';
  }
  if (order.paymentStatus === 'failed') {
    return '❌ Payment Failed';
  }
  if (order.deliveryStatus === 'sent') {
    return '✅ Delivered';
  }
  if (order.fulfillmentStatus === 'manual_pending') {
    return '⏳ Processing (few minutes)';
  }
  if (order.fulfillmentStatus === 'failed') {
    return '❌ Failed — Contact Support';
  }
  if (order.fulfillmentStatus === 'ready') {
    return '✅ Completed';
  }
  if (order.paymentStatus === 'verified') {
    return '⏳ Processing';
  }
  return '⏳ In Progress';
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

function legacyHomeKeyboard(store: BotContext): InlineKeyboard {
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
  keyboard.text('📜 Terms & Policies', 'terms:');
  return keyboard;
}

function homeKeyboard(store: BotContext): InlineKeyboard {
  if (!store.studio) {
    return legacyHomeKeyboard(store);
  }
  const keyboard = new InlineKeyboard();
  for (const row of layoutHomeButtons(store.studio.config, { resellerSignupEnabled: store.resellerSignupEnabled })) {
    for (const button of row) {
      const label = clip(button.text, 64);
      if (button.kind === 'url') {
        keyboard.url(label, button.url);
      } else {
        keyboard.text(label, button.data);
      }
    }
    keyboard.row();
  }
  return keyboard;
}

function linkLine(label: string, url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }
  return `${label}: ${normalizeBotUrl(trimmed)}`;
}

function templateVars(
  store: BotContext,
  balanceMinor: bigint,
  firstName: string | null | undefined,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const links = store.studio?.config.links;
  return {
    name: firstName?.trim() || 'there',
    store: store.storeName,
    balance: formatUsdt(balanceMinor),
    channel: links ? linkLine(links.channel.label, links.channel.url) : '',
    group: links ? linkLine(links.group.label, links.group.url) : '',
    website: links ? linkLine(links.website.label, links.website.url) : '',
    ...extra,
  };
}

function renderStoreTemplate(template: string, vars: Record<string, string>, fallback: string): string {
  const rendered = renderTemplate(template, vars).replace(/\n{3,}/g, '\n\n').trim();
  return rendered.length > 0 ? rendered : fallback;
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
  parseMode: 'HTML' = 'HTML',
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

function legacyWelcome(store: BotContext, balanceMinor: bigint): string {
  return (
    `👋 <b>Welcome to ${escHtml(store.storeName)}!</b>\n\n` +
    `Tap below to browse products, use /deposit to top up your wallet,\n` +
    `/profile to see your orders, or /support if you need help.\n\n` +
    `💰 Balance: <b>${escHtml(formatUsdt(balanceMinor))}</b>`
  );
}

function welcomeText(store: BotContext, balanceMinor: bigint, firstName?: string | null): string {
  if (!store.studio) {
    return legacyWelcome(store, balanceMinor);
  }
  return renderStoreTemplate(
    store.studio.config.welcome,
    templateVars(store, balanceMinor, firstName),
    legacyWelcome(store, balanceMinor),
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
  let customerJustCreated = false;
  let store: BotContext | null = null;

  async function storeContext(): Promise<BotContext> {
    if (store === null) {
      store = await resolveBotContextCached(context.supabase, context.botConnection.id, context.tenantId);
    }
    return store;
  }

  async function loadCatalog(): Promise<CatalogItem[]> {
    const cacheKey = `bot_products_${context.botConnection.id}`;
    return withCache(cacheKey, PRODUCT_CACHE_MS, async () => {
      const items =
        context.tenantId === null
          ? (await listProducts(context.supabase, { status: 'published' })).map((product) => ({
              product,
              priceMinor: product.retailPriceMinor,
            }))
          : (await listResellerListings(context.supabase, context.tenantId))
              .filter((listing) => listing.isVisible && listing.product.status === 'published')
              .map((listing) => ({ product: listing.product, priceMinor: listing.retailPriceMinor }));
      const sold = await loadSoldCounts(
        context.supabase,
        items.map((item) => item.product.id),
        context.tenantId,
      ).catch(() => null);
      return items.map((item) => ({
        ...item,
        soldCount: sold ? (sold.get(item.product.id) ?? 0) : null,
      }));
    });
  }

  function paint(buttons: readonly ScreenButton[]): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    for (const row of layoutScreenButtons(buttons)) {
      for (const button of row) {
        keyboard.text(clip(button.text, 64), button.data);
        if (button.style === 'success') {
          keyboard.success();
        }
        if (button.style === 'danger') {
          keyboard.danger();
        }
      }
      keyboard.row();
    }
    return keyboard;
  }

  async function maintenanceBlock(screen: Screen): Promise<boolean> {
    const current = await storeContext();
    if (current.storeStatus !== 'maintenance') {
      return false;
    }
    await show(
      bot,
      screen,
      `🔧 <b>Store Temporarily Closed</b>\n\n${escHtml(current.maintenanceMessage)}\n\nThank you for your patience.`,
      new InlineKeyboard().text('❓ Support', 'support:').text('🏠 Home', 'home:'),
    );
    return true;
  }

  function clearPending(chatId: string | number): void {
    const key = emailKey(context.botConnection.id, chatId);
    awaitingEmail.delete(key);
    awaitingQty.delete(key);
    awaitingFind.delete(key);
    awaitingTopupHash.delete(key);
    awaitingTopupAmount.delete(key);
    awaitingBinanceManual.delete(key);
  }

  async function showHome(screen: Screen): Promise<void> {
    clearPending(screen.chatId);
    const current = await storeContext();
    const balance = customer?.creditBalanceMinor ?? 0n;
    await show(bot, screen, welcomeText(current, balance, customer?.firstName), homeKeyboard(current), 'HTML');
  }

  function storeBotId(): string | null {
    return context.botConnection.id === OWNER_STORE_BOT_ID ? null : context.botConnection.id;
  }

  async function showRefer(screen: Screen): Promise<void> {
    const current = await storeContext();
    const config = current.studio?.config.referrals;
    if (!customer || !config?.enabled) {
      await show(bot, screen, 'This store has not turned referrals on.', homeKeyboard(current), 'HTML');
      return;
    }
    const code = await ensureReferralCode(context.supabase, customer.id);
    const username = context.botConnection.username || bot.botInfo?.username || '';
    const link = referralLink(username, code);
    const summary = await referralSummary(context.supabase, customer.id);
    const freebies = config.freebiesEnabled ? await listFreebies(context.supabase, current.tenantId, customer.id) : [];
    const value = BigInt(config.pointValueMinor);
    const text = referralHomeText({
      template: config.templates.home,
      link,
      invited: summary.invited,
      pending: summary.pending,
      qualified: summary.qualified,
      points: summary.points,
      walletMinor: BigInt(summary.points) * value,
      nextLine: config.freebiesEnabled ? nextFreebieLine(summary.qualified, freebies) : null,
    });
    const keyboard = new InlineKeyboard();
    if (link) {
      keyboard.url('Share', shareUrl(link)).row();
    }
    if (config.redeemEnabled && summary.points >= config.minRedeemPoints) {
      keyboard.text('Redeem', 'redeem_ask:').row();
    }
    if (config.freebiesEnabled) {
      keyboard.text('Freebies', 'freebies:').row();
    }
    keyboard.text('Home', 'home:');
    await show(bot, screen, text, keyboard, 'HTML');
  }

  async function showRedeemConfirm(screen: Screen): Promise<void> {
    const current = await storeContext();
    const config = current.studio?.config.referrals;
    if (!customer || !config?.enabled || !config.redeemEnabled) {
      await showRefer(screen);
      return;
    }
    const summary = await referralSummary(context.supabase, customer.id);
    if (summary.points < config.minRedeemPoints) {
      await showRefer(screen);
      return;
    }
    const amount = BigInt(summary.points) * BigInt(config.pointValueMinor);
    await show(
      bot,
      screen,
      redeemConfirmText(summary.points, amount),
      new InlineKeyboard().text('Confirm', 'redeem_go:').text('Back', 'refer:'),
      'HTML',
    );
  }

  async function confirmRedeem(screen: Screen): Promise<void> {
    const current = await storeContext();
    const config = current.studio?.config.referrals;
    if (!customer || !config?.enabled || !config.redeemEnabled) {
      await showRefer(screen);
      return;
    }
    if (!checkRateLimit(`referral-redeem:${customer.id}`, 5).allowed) {
      await show(bot, screen, 'Please wait a moment and try again.', new InlineKeyboard().text('Home', 'home:'), 'HTML');
      return;
    }
    const summary = await referralSummary(context.supabase, customer.id);
    if (summary.points < config.minRedeemPoints) {
      await showRefer(screen);
      return;
    }
    const amount = BigInt(summary.points) * BigInt(config.pointValueMinor);
    const result = await redeemPoints(context.supabase, {
      customerId: customer.id,
      points: summary.points,
      valuePerPointMinor: BigInt(config.pointValueMinor),
      requestId: `${customer.id}:${screen.messageId ?? 'tap'}`,
      minPoints: config.minRedeemPoints,
    });
    if (!result.success) {
      await show(bot, screen, 'Those points could not be redeemed.', new InlineKeyboard().text('Back', 'refer:'), 'HTML');
      return;
    }
    customer = { ...customer, creditBalanceMinor: result.newBalanceMinor };
    await show(
      bot,
      screen,
      redeemedText(config.templates.redeemed, summary.points, amount),
      new InlineKeyboard().text('Home', 'home:'),
      'HTML',
    );
  }

  async function showFreebies(screen: Screen): Promise<void> {
    const current = await storeContext();
    const config = current.studio?.config.referrals;
    if (!customer || !config?.freebiesEnabled) {
      await show(bot, screen, 'This store has not turned freebies on.', homeKeyboard(current), 'HTML');
      return;
    }
    const items = await listFreebies(context.supabase, current.tenantId, customer.id);
    const keyboard = new InlineKeyboard();
    for (const item of items) {
      if (item.unlocked) {
        keyboard.text(item.title.slice(0, 32), `freebie_claim:${item.id}`).row();
      }
    }
    keyboard.text('Back', 'refer:').text('Home', 'home:');
    await show(bot, screen, freebieListText(config.templates.freebies, items), keyboard, 'HTML');
  }

  async function claimOneFreebie(screen: Screen, freebieId: string): Promise<void> {
    const current = await storeContext();
    const config = current.studio?.config.referrals;
    if (!customer || !config?.freebiesEnabled) {
      await showFreebies(screen);
      return;
    }
    if (!checkRateLimit(`referral-claim:${customer.id}`, 10).allowed) {
      await show(bot, screen, 'Please wait a moment and try again.', new InlineKeyboard().text('Back', 'freebies:'), 'HTML');
      return;
    }
    const result = await claimFreebie(context.supabase, {
      tenantId: current.tenantId,
      customerId: customer.id,
      freebieId,
    });
    if (result.status !== 'ready' || !result.freebie) {
      await show(bot, screen, 'That freebie is still locked.', new InlineKeyboard().text('Back', 'freebies:'), 'HTML');
      return;
    }
    await show(
      bot,
      screen,
      freebieContentText(result.freebie.title, result.freebie.kind, result.freebie.content),
      new InlineKeyboard().text('Back', 'freebies:').text('Home', 'home:'),
      'HTML',
    );
  }

  async function acceptStartReferral(payload: string): Promise<void> {
    if (!customer || !customerJustCreated || !payload.startsWith('ref_')) {
      return;
    }
    const current = await storeContext();
    const config = current.studio?.config.referrals;
    if (!config?.enabled) {
      return;
    }
    if (!checkRateLimit(`referral-attach:${customer.id}`, 10).allowed) {
      return;
    }
    const code = payload.slice('ref_'.length).trim().toLowerCase();
    if (!isReferralCode(code)) {
      return;
    }
    const attached = await attachReferral(context.supabase, {
      botId: storeBotId(),
      tenantId: current.tenantId,
      code,
      referredId: customer.id,
      referredIsNew: true,
    });
    if (!attached.attached || !attached.referrerId) {
      return;
    }
    try {
      const referrer = await getCustomerById(context.supabase, attached.referrerId);
      await bot.api.sendMessage(referrer.telegramChatId, friendJoinedText(config.templates.friendJoined, customer.firstName), {
        parse_mode: 'HTML',
      });
      await context.supabase
        .from('referrals')
        .update({ joined_notified_at: new Date().toISOString() })
        .eq('referred_customer_id', customer.id);
    } catch {
      // The sweep tells the referrer once if this send fails.
    }
  }

  async function showShop(screen: Screen, categoryToken?: string, page = 0, showAll = false): Promise<void> {
    if (await maintenanceBlock(screen)) {
      return;
    }
    const current = await storeContext();
    const catalog = await loadCatalog();
    if (catalog.length === 0) {
      await show(
        bot,
        screen,
        `😔 <b>No products available right now</b>\n\nCheck back soon!`,
        new InlineKeyboard().text('🏠 Home', 'home:'),
      );
      return;
    }
    const catalogConfig = current.studio?.config.catalog;
    const view = renderShop({
      products: catalog.map((item) => shopProductFrom(item.product, item.priceMinor, item.soldCount)),
      ...(catalogConfig ? { settings: catalogConfig.categories, templates: catalogConfig.templates } : {}),
      page,
      ...(categoryToken ? { categoryToken } : {}),
      ...(showAll ? { showAll } : {}),
    });
    await show(bot, screen, view.text, paint(view.rows.flat()), 'HTML');
  }

  async function priceOffer(product: Product): Promise<{ tiers: Awaited<ReturnType<typeof listBulkTiers>>; floorMinor: bigint | null }> {
    const tenantId = context.tenantId;
    const [tiers, floor] = await Promise.all([
      listBulkTiers(context.supabase, product.id, tenantId),
      readCostFloor(context.supabase, product, tenantId === null ? 'owner' : 'reseller'),
    ]);
    return { tiers, floorMinor: floor.minor };
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
    const current = await storeContext();
    const templates = current.studio?.config.catalog.templates;
    const view = shopProductFrom(item.product, item.priceMinor, item.soldCount);
    const offer = await priceOffer(item.product);
    const bulk = bulkOfferText({
      baseUnit: item.priceMinor,
      tiers: offer.tiers,
      floorMinor: offer.floorMinor,
      ...(templates ? { templates } : {}),
      heading: 'card',
    });
    const text = productCardText(view, templates, bulk);
    await show(
      bot,
      screen,
      text,
      paint(productCardButtons(view, item.product.status === 'published')),
      'HTML',
    );
  }

  async function paymentKeyboard(order: Order): Promise<InlineKeyboard> {
    const current = await storeContext();
    const balance = customer?.creditBalanceMinor ?? 0n;
    const config = await loadPaymentConfig(context.supabase, balance, context.tenantId);
    const methods = buyerCheckoutMethods(config);
    return paint(
      checkoutButtons({
        orderId: order.id,
        productId: order.productId,
        totalMinor: order.quotedRetailPriceMinor,
        balanceMinor: balance,
        minimumDepositMinor: current.minimumDepositMinor,
        binance: methods.binance,
        bep20: methods.bep20 && Boolean(normalizeEthAddress(current.usdtWalletAddress ?? '')),
        trc20: methods.trc20,
        demo: methods.demo,
        binanceManual: methods.binanceManual,
      }),
    );
  }

  async function showPaymentOptions(screen: Screen, order: Order, productTitle: string): Promise<void> {
    if (customer !== null) {
      customer = await getCustomerById(context.supabase, customer.id);
    }
    const current = await storeContext();
    const config = await loadPaymentConfig(
      context.supabase,
      customer?.creditBalanceMinor ?? 0n,
      context.tenantId,
    );
    if (await rejectIfExpired(screen, order)) {
      return;
    }
    const catalog = await loadCatalog();
    const item = catalog.find((entry) => entry.product.id === order.productId);
    const view = item ? shopProductFrom(item.product, item.priceMinor, item.soldCount) : null;
    const offer = item ? await priceOffer(item.product) : null;
    const priced = item && offer
      ? chargedQuoteDisplay({
          baseUnit: item.priceMinor,
          tiers: offer.tiers,
          quantity: order.quantity,
          quotedRetailMinor: order.quotedRetailPriceMinor,
          floorMinor: offer.floorMinor,
        })
      : null;
    const templates = current.studio?.config.catalog.templates;
    const confirmation = item && offer
      ? bulkSavingsSentence({
          baseUnit: item.priceMinor,
          tiers: offer.tiers,
          floorMinor: offer.floorMinor,
          ...(templates ? { templates } : {}),
          quantity: order.quantity,
          quotedRetailMinor: order.quotedRetailPriceMinor,
        })
      : '';
    const text = checkoutText({
      title: current.studio?.config.messages.checkoutHeader ?? '',
      productTitle,
      quantity: order.quantity,
      warranty: view ? resolvedWarranty(view) : null,
      totalMinor: order.quotedRetailPriceMinor,
      ...(priced ? { unitMinor: priced.unitRetailMinor } : {}),
      ...(confirmation.length > 0 ? { confirmation } : {}),
      balanceMinor: customer?.creditBalanceMinor ?? 0n,
      windowLine: paymentWindowLine(order),
      ...(current.studio ? { shortfallTemplate: current.studio.config.catalog.templates.checkoutShortfall } : {}),
      minimumDepositMinor: current.minimumDepositMinor,
      ...(config.demoEnabled ? { demoNotice: 'Demo mode. No real payment is required.' } : {}),
      ...(!config.bep20Enabled && !config.binancePayEnabled && !config.demoEnabled
        ? { paymentsNotice: 'Crypto payments are temporarily unavailable.' }
        : {}),
    });
    await show(bot, screen, text, await paymentKeyboard(order), 'HTML');
  }

  async function handleBuy(screen: Screen, productId: string): Promise<void> {
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
    await showQuantityPicker(screen, item);
  }

  function paymentWindowLine(order: Order): string {
    const deadline = new Date(order.createdAt.getTime() + CHECKOUT_WINDOW_MS);
    const remainingMs = deadline.getTime() - Date.now();
    const hh = String(deadline.getUTCHours()).padStart(2, '0');
    const mm = String(deadline.getUTCMinutes()).padStart(2, '0');
    if (remainingMs <= 0) {
      return `⏳ This order expired at ${hh}:${mm} UTC. Please start again.`;
    }
    const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    return `⏳ You have ${minutes} minute${minutes === 1 ? '' : 's'} to complete this payment (expires at ${hh}:${mm} UTC).`;
  }

  async function rejectIfExpired(screen: Screen, order: Order): Promise<boolean> {
    if (!isCheckoutExpired(order) || order.paymentStatus === 'verified') {
      return false;
    }
    await expireCheckout(context.supabase, order.id);
    const latest = await getOrder(context.supabase, order.id);
    if (latest.paymentStatus !== 'expired') {
      return false;
    }
    await show(
      bot,
      screen,
      '⏳ <b>This order expired.</b>\n\nPlease start again.',
      new InlineKeyboard().text('🛍 Browse Shop', 'shop:').text('🏠 Home', 'home:'),
      'HTML',
    );
    return true;
  }

  async function showQuantityPicker(screen: Screen, item: CatalogItem): Promise<void> {
    const maxQty = maxOrderQuantity(item.product);
    if (maxQty <= 1) {
      await placeOrder(screen, item, 1);
      return;
    }
    const buttonMax = Math.min(maxQty, 10);
    const keyboard = new InlineKeyboard();
    for (let count = 1; count <= buttonMax; count += 1) {
      keyboard.text(String(count), `qp:${item.product.id}:${count}`);
      if (count % 5 === 0) {
        keyboard.row();
      }
    }
    keyboard.row().text('✏️ Type a number', `qty_type:${item.product.id}`);
    keyboard.row().text('❌ Cancel', 'shop:').danger();
    const current = await storeContext();
    const templates = current.studio?.config.catalog.templates;
    const offer = await priceOffer(item.product);
    const bulk = bulkOfferText({
      baseUnit: item.priceMinor,
      tiers: offer.tiers,
      floorMinor: offer.floorMinor,
      ...(templates ? { templates } : {}),
      heading: 'quantity',
    });
    awaitingQty.set(emailKey(context.botConnection.id, screen.chatId), { productId: item.product.id, max: maxQty });
    await show(
      bot,
      screen,
      quantityText(shopProductFrom(item.product, item.priceMinor, item.soldCount), item.priceMinor, maxQty, bulk),
      keyboard,
      'HTML',
    );
  }

  async function placeOrder(screen: Screen, item: CatalogItem, quantity: number): Promise<void> {
    if (customer === null) {
      throw new Error('missing customer');
    }
    awaitingQty.delete(emailKey(context.botConnection.id, screen.chatId));
    const maxQty = maxOrderQuantity(item.product);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
      await show(
        bot,
        screen,
        `❌ Enter a whole number from 1 to ${maxQty}.`,
        new InlineKeyboard().text('⬅ Back', `buy:${item.product.id}`),
        'HTML',
      );
      return;
    }
    try {
    const order = await openCheckoutOrder(context.supabase, {
      channel: context.tenantId === null ? 'owner_store' : 'reseller_bot',
      ...(context.tenantId !== null ? { tenantId: context.tenantId } : {}),
      botId: context.botConnection.id,
      customerId: customer.id,
      productId: item.product.id,
      quantity,
      idempotencyKey: 'checkout',
    });
    if (item.product.requiresEmailActivation) {
        awaitingEmail.set(emailKey(context.botConnection.id, screen.chatId), {
          orderId: order.id,
          productTitle: item.product.title,
        });
        await show(
          bot,
          screen,
          `📧 <b>Email Required</b>\n\n` +
            `<b>${escHtml(item.product.title)}</b> is activated on your account.\n\n` +
            `Please send your <b>email address</b> to continue:\n` +
            `(e.g. yourname@gmail.com)`,
          new InlineKeyboard().text('❌ Cancel', `cancel_order:${order.id}`),
          'HTML',
        );
        return;
      }
      await showPaymentOptions(screen, order, item.product.title);
    } catch (error: unknown) {
      logger.error('telegram buy failed', {
        code: error instanceof AppError ? error.code : 'unknown',
        message: error instanceof Error ? error.message : 'unknown',
      });
      const code = error instanceof AppError ? error.code : '';
      if (code === 'INSUFFICIENT_FUNDS' || code === 'INSUFFICIENT_AVAILABLE_FUNDS') {
        await show(
          bot,
          screen,
          '❌ <b>Store Unavailable</b>\n\nThis store cannot complete that purchase right now. Please try again later or contact /support.',
          new InlineKeyboard().text('❓ Support', 'support:').text('⬅ Back', 'start:'),
        );
        return;
      }
      if (code === 'OUT_OF_STOCK' || code === 'PRODUCT_NOT_AVAILABLE') {
        await show(
          bot,
          screen,
          '❌ <b>Out of Stock</b>\n\nThis product is currently unavailable. Browse other products.',
          new InlineKeyboard().text('🛍 Browse Shop', 'shop_all:'),
        );
        return;
      }
      if (code === 'NOT_FOUND' || code === 'PRODUCT_NOT_FOUND') {
        await show(
          bot,
          screen,
          '❌ <b>Product Unavailable</b>\n\nThis product is no longer listed.',
          new InlineKeyboard().text('🛍 Browse Shop', 'shop_all:'),
        );
        return;
      }
      await show(
        bot,
        screen,
        '❌ <b>Something went wrong</b>\n\nPlease try again. If this keeps happening, contact /support.',
        homeKeyboard(await storeContext()),
      );
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
      `✅ <b>Payment Confirmed!</b>\n\n` +
        `📦 ${escHtml(product.title)}\n` +
        `💵 ${money(order.quotedRetailPriceMinor)}\n` +
        `🔖 Order: <code>${orderRef(order.id)}</code>\n\n` +
        `Your order is being prepared.\n` +
        `${minutes ? `⏱ Estimated delivery: ~${minutes} minutes` : 'Delivery is in progress.'}\n\n` +
        `You will receive your product in this chat shortly.`,
      new InlineKeyboard().text('📦 My Orders', 'orders:').text('🏠 Home', 'home:'),
    );
  }

  async function startBinance(screen: Screen, orderId: string): Promise<void> {
    const current = await storeContext();
    const order = await ownedOrder(orderId);
    if (!order) {
      await show(bot, screen, BOT_ERRORS.ORDER_NOT_FOUND, homeKeyboard(current), 'HTML');
      return;
    }
    if (await rejectIfExpired(screen, order)) {
      return;
    }
    if (!current.binancePayEnabled) {
      if (paymentSandboxEnabled()) {
        await show(
          bot,
          screen,
          `💳 <b>Binance Pay — Demo Mode</b>\n\n` +
            `⚠️ No live Binance Pay credentials are saved yet.\n\n` +
            `For testing, confirm a simulated payment below.`,
          new InlineKeyboard()
            .text('✅ Simulate Payment', `pay_demo_confirm:${order.id}`)
            .row()
            .text('❌ Cancel', `cancel_order:${order.id}`),
          'HTML',
        );
        return;
      }
      awaitingBinanceManual.set(topupKey(screen.chatId), order.id);
      await show(
        bot,
        screen,
        `💳 <b>Binance Pay — request review</b>\n\n` +
          `Automatic Binance Pay is not connected for this store.\n` +
          `Send your Binance Pay reference (5 to 80 characters).\n` +
          `The store owner reviews it in the dashboard.\n\n` +
          `This does not mark the order paid.`,
        new InlineKeyboard().text('❌ Cancel', `cancel_order:${order.id}`),
        'HTML',
      );
      return;
    }
    try {
      const checkout = await createBinancePayOrder(context.supabase, order.id);
      const keyboard = new InlineKeyboard()
        .url('Open Binance Pay', checkout.checkoutUrl)
        .row()
        .text('❌ Cancel', `cancel_order:${order.id}`);
      await show(
        bot,
        screen,
        `💳 <b>Binance Pay</b>\n\n` +
          `💵 Amount: <b>${escHtml(formatUsdt(order.quotedRetailPriceMinor))}</b>\n` +
          `🔖 Order: <code>${orderRef(order.id)}</code>\n\n` +
          `Open Binance Pay and complete the payment.\n` +
          `Then send your <b>Binance Pay Order ID</b> in this chat.\n\n` +
          `${paymentWindowLine(order)}`,
        keyboard,
        'HTML',
      );
    } catch (error: unknown) {
      logger.error('telegram binance checkout failed', {
        orderId,
        message: error instanceof Error ? error.message : 'unknown',
      });
      const timedOut = error instanceof AppError && error.code === 'BINANCE_TIMEOUT';
      await show(
        bot,
        screen,
        timedOut
          ? BOT_ERRORS.BINANCE_TIMEOUT
          : '❌ <b>Could not create payment</b>\n\nTry another method or contact /support.',
        await paymentKeyboard(order),
        'HTML',
      );
    }
  }

  async function startBep20(screen: Screen, orderId: string): Promise<void> {
    const current = await storeContext();
    const order = await ownedOrder(orderId);
    const address = normalizeEthAddress(current.usdtWalletAddress ?? '');
    if (!order || !address) {
      await show(
        bot,
        screen,
        'Crypto payments are temporarily unavailable.',
        order ? await paymentKeyboard(order) : homeKeyboard(current),
        'HTML',
      );
      return;
    }
    if (await rejectIfExpired(screen, order)) {
      return;
    }
    const keyboard = new InlineKeyboard()
      .text('📋 Copy Address', 'copy_addr:')
      .row()
      .text('❌ Cancel Order', `cancel_order:${order.id}`);
    await show(
      bot,
      screen,
      `📤 <b>Send USDT (BEP20)</b>\n\n` +
        `Send at least:\n<b>${money(order.quotedRetailPriceMinor)}</b>\n` +
        `Network: BNB Smart Chain (BEP20) only. Sending on another network loses the money.\n\n` +
        `To this address:\n<code>${escHtml(address)}</code>\n\n` +
        `After sending, reply with your transaction hash (0x and 64 characters).\n\n` +
        `Order: <code>${orderRef(order.id)}</code>\n` +
        `${paymentWindowLine(order)}`,
      keyboard,
    );
  }

  async function startTrc20(screen: Screen, orderId: string): Promise<void> {
    if (!buyerTrc20Visible()) {
      await show(
        bot,
        screen,
        'TRC20 cannot be confirmed automatically, so it is not offered.',
        homeKeyboard(await storeContext()),
        'HTML',
      );
      return;
    }
    const current = await storeContext();
    const order = await ownedOrder(orderId);
    const address = current.trc20WalletAddress;
    if (!order || !address) {
      await show(bot, screen, ERROR_TEXT.ORDER_NOT_FOUND ?? '', homeKeyboard(current), 'HTML');
      return;
    }
    if (await rejectIfExpired(screen, order)) {
      return;
    }
    await show(
      bot,
      screen,
      `📤 <b>Send USDT (TRC20)</b>\n\n` +
        `Send exactly:\n<b>${escHtml(formatUsdt(order.quotedRetailPriceMinor))}</b> on TRC20 network (TRON)\n\n` +
        `To address:\n<code>${escHtml(address)}</code>\n\n` +
        `⚠️ Send on TRC20 network ONLY. BEP20/ERC20 will be lost.\n\n` +
        `After sending, reply with your transaction hash.\n` +
        `Order: <code>${orderRef(order.id)}</code>\n` +
        `${paymentWindowLine(order)}`,
      new InlineKeyboard().text('❌ Cancel Order', `cancel_order:${order.id}`),
      'HTML',
    );
  }

  async function startDemo(screen: Screen, orderId: string): Promise<void> {
    if (!paymentSandboxEnabled()) {
      await show(bot, screen, 'Crypto payments are temporarily unavailable.', homeKeyboard(await storeContext()), 'HTML');
      return;
    }
    const order = await ownedOrder(orderId);
    if (!order) {
      await show(bot, screen, BOT_ERRORS.ORDER_NOT_FOUND, homeKeyboard(await storeContext()), 'HTML');
      return;
    }
    if (await rejectIfExpired(screen, order)) {
      return;
    }
    await show(
      bot,
      screen,
      `🧪 <b>Demo Mode Payment</b>\n\n` +
        `⚠️ This is a test environment. No real payment is required.\n\n` +
        `🔖 Order: <code>${orderRef(order.id)}</code>\n` +
        `${paymentWindowLine(order)}\n\n` +
        `Tap below to simulate a successful payment:`,
      new InlineKeyboard()
        .text('✅ Confirm Test Payment', `pay_demo_confirm:${order.id}`)
        .row()
        .text('❌ Cancel', `cancel_order:${order.id}`),
      'HTML',
    );
  }

  async function confirmDemo(screen: Screen, orderId: string): Promise<void> {
    if (!paymentSandboxEnabled()) {
      await show(bot, screen, 'Crypto payments are temporarily unavailable.', homeKeyboard(await storeContext()), 'HTML');
      return;
    }
    const current = await storeContext();
    const order = await ownedOrder(orderId);
    if (!order) {
      await show(bot, screen, BOT_ERRORS.ORDER_NOT_FOUND, homeKeyboard(current), 'HTML');
      return;
    }
    if (order.paymentStatus === 'verified') {
      await show(bot, screen, BOT_ERRORS.ORDER_ALREADY_PAID, homeKeyboard(current), 'HTML');
      return;
    }
    await show(bot, screen, '⏳ <b>Confirming test payment...</b>', undefined, 'HTML');
    try {
      await confirmDemoOrderPayment(context.supabase, order.id);
      const product = await getProduct(context.supabase, order.productId);
      await show(
        bot,
        screen,
        `✅ <b>Demo Payment Confirmed!</b>\n\n` +
          `📦 ${escHtml(product.title)}\n` +
          `🔖 Order: <code>${orderRef(order.id)}</code>\n\n` +
          `Your order is being prepared. You'll receive it shortly.\n\n` +
          `<i>⚠️ This was a simulated payment in demo mode.</i>`,
        new InlineKeyboard().text('📦 My Orders', 'orders:').text('🏠 Home', 'home:'),
        'HTML',
      );
    } catch (error: unknown) {
      logger.error('demo payment failed', {
        orderId,
        message: error instanceof Error ? error.message : 'unknown',
      });
      await show(bot, screen, BOT_ERRORS.GENERIC_ERROR, await paymentKeyboard(order), 'HTML');
    }
  }

  async function payFromWallet(screen: Screen, orderId: string): Promise<void> {
    const started = Date.now();
    const stage = (name: string): void => {
      logger.info('wallet pay stage', { stage: name, orderId, ms: Date.now() - started });
    };
    stage('start');
    const processingStore = await storeContext();
    const processingText = processingStore.studio
      ? renderStoreTemplate(
          processingStore.studio.config.messages.orderProcessing,
          templateVars(processingStore, customer?.creditBalanceMinor ?? 0n, customer?.firstName),
          '⏳ <b>Processing your order...</b>\n\nPlease wait a few seconds. Do not tap again.',
        )
      : '⏳ <b>Processing your order...</b>\n\nPlease wait a few seconds. Do not tap again.';
    await show(bot, screen, processingText, new InlineKeyboard(), 'HTML');
    stage('processing_shown');
    const current = await storeContext();
    if (customer === null) {
      throw new Error('missing customer');
    }
    const order = await ownedOrder(orderId);
    stage('order_read');
    if (!order) {
      await show(bot, screen, BOT_ERRORS.ORDER_NOT_FOUND, homeKeyboard(current), 'HTML');
      return;
    }
    if (order.paymentStatus === 'verified' || order.paymentStatus === 'pending_verification') {
      await show(
        bot,
        screen,
        '⏳ <b>Already processing your order.</b>\n\nPlease wait a few seconds.',
        new InlineKeyboard().text('📦 My Orders', 'orders:').text('🏠 Home', 'home:'),
        'HTML',
      );
      return;
    }
    if (await rejectIfExpired(screen, order)) {
      return;
    }
    const balance = (await getCustomerById(context.supabase, customer.id)).creditBalanceMinor;
    if (balance < order.quotedRetailPriceMinor) {
      const shortfall = order.quotedRetailPriceMinor - balance;
      await show(
        bot,
        screen,
        BOT_ERRORS.INSUFFICIENT_BALANCE(
          formatUsdt(order.quotedRetailPriceMinor),
          formatUsdt(balance),
          formatUsdt(shortfall),
        ),
        new InlineKeyboard().text('💳 Add Funds', 'deposit:').text('❌ Cancel', `cancel_order:${order.id}`),
        'HTML',
      );
      return;
    }
    try {
      const paid = await payOrderFromCustomerWallet(context.supabase, order.id, customer.id);
      stage('debited');
      customer = { ...customer, creditBalanceMinor: paid.newBalance };
      CUSTOMER_CACHE.delete(`${context.botConnection.id}:${customer.telegramUserId}`);
      const product = (await loadCatalog()).find((entry) => entry.product.id === order.productId)?.product
        ?? (await getProduct(context.supabase, order.productId));
      const { startInlineDelivery, takeInlineMessage, markCustomerNotified } = await import(
        '@/modules/fulfillment/customer-message'
      );
      startInlineDelivery(order.id);
      stage('fulfillment_start');
      let fulfilled = false;
      try {
        const { processQueuedOrder } = await import('@/modules/fulfillment');
        const result = await processQueuedOrder(context.supabase, order.id);
        fulfilled = result.success;
        stage('fulfillment_done');
      } catch (error: unknown) {
        logger.error('wallet fulfillment failed', {
          orderId: order.id,
          message: error instanceof Error ? error.message : 'unknown',
        });
        await show(
          bot,
          screen,
          `✅ <b>Payment Received</b>\n\n` +
            `Your order is being processed. You'll receive your product shortly.\n` +
            `Check <b>My Orders</b> for status updates.`,
          new InlineKeyboard().text('📦 My Orders', 'orders:').text('🏠 Home', 'home:'),
        );
        return;
      }
      const latest = await getOrder(context.supabase, order.id);
      const inlineText = takeInlineMessage(order.id);
      const manual = product.deliveryType === 'manual' || latest.fulfillmentStatus === 'manual_pending';
      const activating =
        product.requiresEmailActivation ||
        latest.fulfillmentStatus === 'supplier_pending' ||
        latest.fulfillmentStatus === 'outcome_unknown' ||
        latest.fulfillmentStatus === 'processing';
      const homeKeys = new InlineKeyboard().text('📦 My Orders', 'orders:').text('🏠 Home', 'home:');
      if (!fulfilled && latest.paymentStatus !== 'verified') {
        await show(
          bot,
          screen,
          '❌ <b>Payment could not be completed</b>\n\nYour balance was refunded. Please start the order again.',
          homeKeys,
          'HTML',
        );
        stage('refund_shown');
        return;
      }
      if (manual) {
        await show(
          bot,
          screen,
          `⏳ <b>Processing Your Order</b>\n\n` +
            `📦 ${escHtml(product.title)}\n` +
            `Your order requires manual processing (usually within 5-30 minutes).\n` +
            `We'll message you here when it's ready.\n\n` +
            `Order: <code>${orderRef(order.id)}</code>`,
          homeKeys,
          'HTML',
        );
        return;
      }
      if (activating) {
        await show(
          bot,
          screen,
          `⏳ <b>Activation In Progress</b>\n\n` +
            `📦 ${escHtml(product.title)}\n` +
            `📧 Being activated on your email.\n` +
            `⏱ ETA: ASAP — we'll message you when ready.\n\n` +
            `Order: <code>${orderRef(order.id)}</code>`,
          homeKeys,
          'HTML',
        );
        return;
      }
      const { deliveryTextForOrder } = await import('@/modules/fulfillment/customer-message');
      const deliveredStore = await storeContext();
      await show(
        bot,
        screen,
        inlineText ??
          (await deliveryTextForOrder(context.supabase, deliveredStore.tenantId, {
            title: product.title,
            quantity: latest.quantity,
            amountMinor: paid.amount,
            balanceMinor: paid.newBalance,
            orderId: order.id,
            content: 'Your product is in this chat.',
          })),
        homeKeys,
        'HTML',
      );
      if (latest.deliveryStatus !== 'sent') {
        await markCustomerNotified(context.supabase, order.id);
      }
      stage('delivered_shown');
    } catch (error: unknown) {
      const code = error instanceof AppError ? error.code : '';
      if (code === 'ORDER_EXPIRED') {
        await show(
          bot,
          screen,
          '⏳ <b>This order expired.</b>\n\nPlease start again.',
          new InlineKeyboard().text('🛍 Browse Shop', 'shop:').text('🏠 Home', 'home:'),
          'HTML',
        );
        return;
      }
      if (code === 'PAYMENT_IN_PROGRESS' || code === 'ORDER_ALREADY_PAID') {
        await show(
          bot,
          screen,
          '⏳ <b>Already processing your order.</b>\n\nPlease wait a few seconds.',
          new InlineKeyboard().text('📦 My Orders', 'orders:').text('🏠 Home', 'home:'),
          'HTML',
        );
        return;
      }
      if (code === 'INSUFFICIENT_BALANCE') {
        await show(
          bot,
          screen,
          BOT_ERRORS.INSUFFICIENT_BALANCE(
            formatUsdt(order.quotedRetailPriceMinor),
            formatUsdt(balance),
            formatUsdt(order.quotedRetailPriceMinor - balance),
          ),
          new InlineKeyboard().text('💳 Add Funds', 'deposit:').text('❌ Cancel', `cancel_order:${order.id}`),
          'HTML',
        );
        return;
      }
      logger.error('wallet payment failed', {
        orderId,
        message: error instanceof Error ? error.message : 'unknown',
      });
      await show(
        bot,
        screen,
        '❌ <b>Payment failed</b>\n\nYour balance was not charged. Please try again or contact /support.',
        await paymentKeyboard(order),
        'HTML',
      );
    }
  }

  async function verifyReference(screen: Screen, text: string): Promise<boolean> {
    const trimmed = text.trim();
    const sandbox = paymentSandboxEnabled();
    const isHash = TX_HASH_REGEX.test(trimmed) || (sandbox && trimmed.startsWith(PAYMENT_CONFIG.demo.failTxPrefix));
    const isBinance =
      BINANCE_NUMERIC_ORDER_ID_REGEX.test(trimmed) ||
      (sandbox &&
        (trimmed.startsWith(PAYMENT_CONFIG.demo.successPrefix) || trimmed.startsWith(PAYMENT_CONFIG.demo.failPrefix)));
    if (!isHash && !isBinance) {
      return false;
    }
    const order = await latestPayableOrder();
    if (!order) {
      await show(bot, screen, `No pending order found. Use /orders to check your orders.`, homeKeyboard(await storeContext()));
      return true;
    }
    await show(bot, screen, isHash ? `⏳ Verifying your transaction on the blockchain...` : `⏳ Verifying your Binance Pay payment...`);
    if (sandbox) {
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
      const reason = result.rejectReason ?? '';
      const method = isHash ? 'USDT' : 'Binance Pay';
      const text =
        reason === 'PAYMENTS_UNAVAILABLE' || reason === 'BINANCE_UNAVAILABLE'
          ? 'Crypto payments are temporarily unavailable.'
          : reason === 'NOT_FOUND'
            ? 'That transfer was not found yet. Try again in a minute.'
            : reason === 'TOO_FEW_CONFIRMATIONS'
              ? 'Too few confirmations so far. Try again in a minute.'
              : reason === 'TX_REPLAY' || reason === 'ALREADY_USED'
                ? 'This transaction hash was already used.'
                : reason === 'AMOUNT_MISMATCH' || reason === 'AMOUNT_TOO_SMALL'
                  ? BOT_ERRORS.AMOUNT_MISMATCH(formatUsdt(order.quotedRetailPriceMinor), 'a smaller amount')
                  : BOT_ERRORS.PAYMENT_VERIFICATION_FAILED(method);
      await show(bot, screen, text, await paymentKeyboard(order), 'HTML');
    } catch (error: unknown) {
      logger.error('telegram payment verification failed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
      const timedOut = error instanceof AppError && error.code === 'BINANCE_TIMEOUT';
      await show(
        bot,
        screen,
        timedOut ? BOT_ERRORS.BINANCE_TIMEOUT : BOT_ERRORS.PAYMENT_VERIFICATION_FAILED(isHash ? 'USDT' : 'Binance Pay'),
        await paymentKeyboard(order),
        'HTML',
      );
    }
    return true;
  }

  function tokenHtml(code: string | undefined): string {
    if (code === 'TOKEN_NOT_FOUND') {
      return BOT_ERRORS.TOKEN_NOT_FOUND;
    }
    if (code === 'TOKEN_REDEEMED') {
      return BOT_ERRORS.TOKEN_ALREADY_USED;
    }
    if (code === 'TOKEN_EXPIRED') {
      return BOT_ERRORS.TOKEN_EXPIRED;
    }
    if (code === 'TOKEN_REVOKED') {
      return BOT_ERRORS.TOKEN_REVOKED;
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
          `Added: <b>+${escHtml(formatUsdt(result.amountCredited))}</b>\n` +
          `New store balance: <b>${escHtml(formatUsdt(result.newBalance))}</b>`,
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
    const notice = await claimCheckoutResume(context.supabase, customer.id);
    if (notice.kind === 'resume') {
      pendingTopup.delete(emailKey(context.botConnection.id, screen.chatId));
      await show(
        bot,
        screen,
        BALANCE_ADDED_TEXT,
        paint([{ text: 'Complete order', data: `pay_menu:${notice.orderId}`, style: 'success', width: 'full' }]),
        'HTML',
      );
      return;
    }
    if (notice.kind === 'expired') {
      pendingTopup.delete(emailKey(context.botConnection.id, screen.chatId));
      await show(
        bot,
        screen,
        BALANCE_EXPIRED_TEXT,
        paint([
          ...(notice.productId
            ? [{ text: 'Start again', data: `buy:${notice.productId}`, style: 'success' as const, width: 'full' as const }]
            : []),
          { text: '🏠 Home', data: 'home:', width: 'full' },
        ]),
        'HTML',
      );
      return;
    }
    await show(
      bot,
      screen,
      `✅ <b>Token Redeemed!</b>\n\n` +
        `Added: <b>+${escHtml(formatUsdt(credit.amountCredited))}</b>\n` +
        `New Balance: <b>${escHtml(formatUsdt(credit.newBalance))}</b>\n\n` +
        `Your funds are ready to use. Tap below to browse products!`,
      new InlineKeyboard().text('🛍 Browse Shop', 'shop:').text('💰 My Wallet', 'wallet:'),
      'HTML',
    );
  }

  async function showWallet(screen: Screen): Promise<void> {
    if (customer === null) {
      throw new Error('missing customer');
    }
    awaitingTopupHash.delete(topupKey(screen.chatId));
    awaitingTopupAmount.delete(topupKey(screen.chatId));
    const fresh = await getCustomerById(context.supabase, customer.id);
    customer = fresh;
    const balance = fresh.creditBalanceMinor;
    const paid = await listOrders(context.supabase, {
      customerId: customer.id,
      paymentStatus: 'verified',
      limit: 5,
    });
    const products = await listProductsByIds(
      context.supabase,
      paid.map((order) => order.productId),
    );
    let text =
      `💰 <b>Your Wallet</b>\n\n` +
      `<b>Balance</b>\n` +
      `${formatUsdt(balance)}\n\n` +
      `Use your balance to purchase products from the shop.`;
    if (paid.length > 0) {
      text += `\n\n<b>Recent Activity:</b>\n`;
      for (const order of paid) {
        const title = products.get(order.productId)?.title ?? 'Product';
        text += `• ${escHtml(title)} — ${escHtml(formatUsdt(order.quotedRetailPriceMinor))}\n`;
      }
    }
    const current = await storeContext();
    const keyboard = new InlineKeyboard();
    if (current.binancePayEnabled) {
      keyboard.text('🔶 Top up with Binance Pay', 'deposit_bp:').row();
    }
    if (current.bep20Enabled && normalizeEthAddress(current.usdtWalletAddress ?? '')) {
      keyboard.text('📤 Top up USDT (BEP20)', 'deposit_bep20:').row();
    }
    if (buyerTrc20Visible() && current.trc20Enabled && current.trc20WalletAddress) {
      keyboard.text('📤 Top up USDT (TRC20)', 'deposit_trc20:').row();
    }
    keyboard.text('🔑 Redeem Top-Up Token', 'dep_token:').row();
    keyboard.text('🔄 Refresh Balance', 'wallet:').text('⬅ Main Menu', 'start:');
    await show(bot, screen, text, keyboard, 'HTML');
  }

  function topupKey(chatId: string | number): string {
    return emailKey(context.botConnection.id, chatId);
  }

  async function showTopupAmount(screen: Screen): Promise<void> {
    const current = await storeContext();
    const limits = { min: current.minimumDepositMinor, max: current.maximumDepositMinor };
    const keyboard = new InlineKeyboard();
    const amounts = quickTopupAmounts(limits);
    for (let index = 0; index < amounts.length; index += 1) {
      const amount = amounts[index];
      if (amount === undefined) {
        continue;
      }
      keyboard.text(formatUsdt(amount).replace(' USDT', ''), `topup_amt:${amount.toString()}`);
      if (index % 2 === 1 || index === amounts.length - 1) {
        keyboard.row();
      }
    }
    keyboard.text('Custom amount', 'topup_custom:').row();
    keyboard.text('⬅ Back to Wallet', 'wallet:');
    awaitingTopupHash.delete(topupKey(screen.chatId));
    awaitingTopupAmount.delete(topupKey(screen.chatId));
    await show(bot, screen, topupAmountPrompt(limits), keyboard, 'HTML');
  }

  async function showTopupInstructions(screen: Screen, amountMinor: bigint | null): Promise<void> {
    if (customer === null) {
      throw new Error('missing customer');
    }
    const current = await storeContext();
    const address = current.usdtWalletAddress;
    if (!address || !normalizeEthAddress(address)) {
      await show(
        bot,
        screen,
        `📤 <b>Top up USDT (BEP20)</b>\n\nPayments are unavailable until this store saves a valid BEP20 address.`,
        new InlineKeyboard().text('🔑 Redeem Token', 'dep_token:').text('⬅ Back to Wallet', 'wallet:'),
        'HTML',
      );
      return;
    }
    const chosen = amountMinor ?? pendingTopup.get(topupKey(screen.chatId)) ?? null;
    if (chosen === null) {
      await showTopupAmount(screen);
      return;
    }
    try {
      const opened = await openWalletTopup(context.supabase, {
        customerId: customer.id,
        botId: context.botConnection.id,
        tenantId: context.tenantId,
        amountMinor: chosen,
      });
      awaitingTopupAmount.delete(topupKey(screen.chatId));
      await show(
        bot,
        screen,
        topupInstructions(opened.topup, address, new Date(), opened.reused),
        new InlineKeyboard()
          .text('I have paid', 'topup_paid:')
          .row()
          .text('Refresh', 'topup_show:')
          .row()
          .text('⬅ Back to Wallet', 'wallet:'),
        'HTML',
      );
    } catch (error: unknown) {
      const message = error instanceof ValidationError ? error.message : 'Could not start the top-up. Try another amount.';
      await show(
        bot,
        screen,
        `❌ ${escHtml(message)}`,
        new InlineKeyboard().text('Choose another amount', 'topup_amounts:').text('⬅ Wallet', 'wallet:'),
        'HTML',
      );
    }
  }

  async function claimTopupHash(screen: Screen, text: string): Promise<void> {
    if (customer === null) {
      throw new Error('missing customer');
    }
    const sent = await bot.api.sendMessage(screen.chatId, '⏳ <b>Checking your payment...</b>', { parse_mode: 'HTML' });
    const finish = async (html: string, keyboard?: InlineKeyboard): Promise<void> => {
      const extra = { parse_mode: 'HTML' as const, ...(keyboard ? { reply_markup: keyboard } : {}) };
      try {
        await bot.api.editMessageText(screen.chatId, sent.message_id, html, extra);
      } catch {
        await bot.api.sendMessage(screen.chatId, html, extra);
      }
    };
    if (!checkRateLimit(`topup-claim:${customer.id}`, 5, 10 * 60 * 1000).allowed) {
      await finish(topupClaimText({ outcome: 'rate_limited' }));
      return;
    }
    const current = await storeContext();
    const address = current.usdtWalletAddress;
    if (!address || !normalizeEthAddress(address)) {
      await finish('Payments are unavailable until this store saves a valid BEP20 address.');
      return;
    }
    const result = await claimWalletTopup(context.supabase, {
      customerId: customer.id,
      txHash: text.trim(),
      toAddress: address,
    });
    if (result.status === 'unavailable') {
      await finish(topupClaimText({ outcome: 'unavailable' }));
      return;
    }
    if (result.status === 'rejected') {
      if (result.reason === 'EXPIRED' || result.reason === 'NO_OPEN_TOPUP') {
        awaitingTopupHash.delete(topupKey(screen.chatId));
      }
      await finish(
        topupClaimText({
          outcome: 'rejected',
          reason: result.reason,
          ...(result.confirmations !== undefined ? { confirmations: result.confirmations } : {}),
        }),
        new InlineKeyboard().text('Wallet', 'wallet:'),
      );
      return;
    }
    awaitingTopupHash.delete(topupKey(screen.chatId));
    customer = { ...customer, creditBalanceMinor: result.newBalance };
    const notice = await claimCheckoutResume(context.supabase, customer.id);
    if (notice.kind === 'resume') {
      pendingTopup.delete(topupKey(screen.chatId));
      await finish(
        BALANCE_ADDED_TEXT,
        paint([{ text: 'Complete order', data: `pay_menu:${notice.orderId}`, style: 'success', width: 'full' }]),
      );
      return;
    }
    if (notice.kind === 'expired') {
      pendingTopup.delete(topupKey(screen.chatId));
      await finish(BALANCE_EXPIRED_TEXT, new InlineKeyboard().text('🏠 Home', 'home:'));
      return;
    }
    await finish(
      topupClaimText({
        outcome: 'credited',
        amountMinor: result.amountMinor,
        newBalance: result.newBalance,
        repeated: result.repeated,
      }),
      new InlineKeyboard().text('🛍 Browse Shop', 'shop:').text('💰 My Wallet', 'wallet:'),
    );
  }

  async function refreshTopup(screen: Screen): Promise<void> {
    if (customer === null) {
      throw new Error('missing customer');
    }
    const current = await storeContext();
    const address = current.usdtWalletAddress;
    if (!address || !normalizeEthAddress(address)) {
      await showTopupInstructions(screen, null);
      return;
    }
    awaitingTopupHash.delete(topupKey(screen.chatId));
    const open = await findOpenTopup(context.supabase, customer.id);
    if (!open) {
      await showTopupAmount(screen);
      return;
    }
    await show(
      bot,
      screen,
      topupInstructions(open, address),
      new InlineKeyboard()
        .text('I have paid', 'topup_paid:')
        .row()
        .text('Refresh', 'topup_show:')
        .row()
        .text('⬅ Back to Wallet', 'wallet:'),
      'HTML',
    );
  }

  async function showBep20Topup(screen: Screen): Promise<void> {
    await showTopupInstructions(screen, null);
  }

  async function showBinanceTopup(screen: Screen): Promise<void> {
    const merchantId = (await storeContext()).binanceMerchantId;
    if (!merchantId) {
      await show(
        bot,
        screen,
        `💳 <b>Top Up — Binance Pay</b>\n\nThis store has not set a Binance Pay merchant ID yet.\nRedeem a top-up token or contact /support.`,
        new InlineKeyboard().text('🔑 Redeem Token', 'dep_token:').text('⬅ Back to Wallet', 'wallet:'),
      );
      return;
    }
    const reference = customer?.telegramUserId ?? 'your Telegram ID';
    await show(
      bot,
      screen,
      `💳 <b>Top Up — Binance Pay</b>\n\n` +
        `Send USDT via Binance Pay to the merchant below.\n` +
        `This chat does not credit Binance Pay top-ups automatically. The store matches your reference.\n\n` +
        `Merchant ID: <code>${escHtml(merchantId)}</code>\n\n` +
        `<b>Reference (required):</b> <code>${escHtml(reference)}</code>\n` +
        `<i>Include your Telegram ID as the reference so we can match your payment.</i>` +
        amountNote(screen.chatId),
      new InlineKeyboard().text('⬅ Back to Wallet', 'wallet:'),
    );
  }

  async function showTrc20Topup(screen: Screen): Promise<void> {
    if (!buyerTrc20Visible()) {
      await show(
        bot,
        screen,
        'TRC20 cannot be confirmed automatically, so it is not offered.',
        new InlineKeyboard().text('⬅ Back to Wallet', 'wallet:'),
        'HTML',
      );
      return;
    }
    const address = (await storeContext()).trc20WalletAddress;
    if (!address) {
      await show(
        bot,
        screen,
        `📤 <b>Top Up — USDT TRC20</b>\n\nThis store has not set a TRC20 address yet.\nRedeem a top-up token or contact /support.`,
        new InlineKeyboard().text('🔑 Redeem Token', 'dep_token:').text('⬅ Back to Wallet', 'wallet:'),
      );
      return;
    }
    await show(
      bot,
      screen,
      `📤 <b>Top Up — USDT TRC20</b>\n\n` +
        `Send USDT (TRC20) to the address below.\n` +
        `Your balance is credited automatically after network confirmation.\n\n` +
        `<code>${escHtml(address)}</code>\n\n` +
        `<i>Network: TRON (TRC20) only. BEP20 and ERC20 transfers will be lost.</i>` +
        amountNote(screen.chatId),
      new InlineKeyboard().text('⬅ Back to Wallet', 'wallet:'),
    );
  }

  function amountNote(chatId: string | number): string {
    const line = depositAmountLine(pendingTopup.get(emailKey(context.botConnection.id, chatId)) ?? null);
    return line.length > 0 ? `\n\n${line}` : '';
  }

  async function showDeposit(screen: Screen): Promise<void> {
    if (await maintenanceBlock(screen)) {
      return;
    }
    const current = await storeContext();
    const keyboard = new InlineKeyboard().text('🔑 Redeem Top-Up Token', 'dep_token:').row();
    if (current.bep20Enabled && normalizeEthAddress(current.usdtWalletAddress ?? '')) {
      keyboard.text('📤 Send USDT (BEP20)', 'dep_bep20:').row();
    }
    if (current.binancePayEnabled) {
      keyboard.text('💳 Binance Pay', 'dep_bp:').row();
    }
    if (buyerTrc20Visible() && current.trc20Enabled && current.trc20WalletAddress) {
      keyboard.text('📤 Send USDT (TRC20)', 'dep_trc20:').row();
    }
    keyboard.text('⬅ Back', 'wallet:');
    await show(
      bot,
      screen,
      `💳 <b>Add Funds</b>\n\nChoose how to add funds to your wallet:${amountNote(screen.chatId)}`,
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
        `📭 <b>No Orders Yet</b>\n\nYou haven't placed any orders yet.`,
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
    await show(bot, screen, `📦 <b>Your Orders</b>\n\nHere are your recent orders:`, keyboard);
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
      `📦 <b>Order Details</b>\n\n` +
      `Product: ${escHtml(product.title)}\n` +
      `Quantity: ${order.quantity}\n` +
      `Amount: <b>${escHtml(formatUsdt(order.quotedRetailPriceMinor))}</b>\n` +
      `Status: ${escHtml(customerFacingStatus(order))}\n` +
      `Order ID: <code>${orderRef(order.id)}</code>\n` +
      `Date: ${escHtml(when)} UTC`;
    const keyboard = new InlineKeyboard();
    if (order.paymentStatus === 'awaiting' || order.paymentStatus === 'pending_verification') {
      keyboard.text('💳 Complete Payment', `pay_menu:${order.id}`).row();
    }
    keyboard.text('⬅ Back to Orders', 'orders:').text('🏠 Home', 'home:');
    await show(bot, screen, text, keyboard, 'HTML');
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
      `👤 <b>Your Profile</b>\n\n` +
        `Name: ${escHtml(name)}\n` +
        `Username: ${escHtml(username)}\n` +
        `Member since: ${escHtml(joined)}\n\n` +
        `📊 <b>Your Stats</b>\n` +
        `Total Orders: ${orders.length}\n` +
        `Completed: ${completed.length}\n` +
        `Total Spent: ${money(spent)}`,
      new InlineKeyboard().text('📦 My Orders', 'orders:').text('💰 My Wallet', 'wallet:').row().text('🏠 Home', 'home:'),
    );
  }

  async function showSupport(screen: Screen): Promise<void> {
    const current = await storeContext();
    const contact = current.supportContact ? `Contact: ${escHtml(current.supportContact)}\n` : '';
    const telegram = current.supportTelegramUrl ? `Telegram: ${escHtml(current.supportTelegramUrl)}\n` : '';
    const legacySupport =
      `❓ <b>Support</b>\n\n${contact}${telegram}\nInclude your <b>Order ID</b> when asking about an order.\nUse /orders to find it.`;
    const intro = current.studio
      ? renderStoreTemplate(
          current.studio.config.messages.supportIntro,
          templateVars(current, customer?.creditBalanceMinor ?? 0n, customer?.firstName),
          '❓ <b>Support</b>',
        )
      : '';
    await show(
      bot,
      screen,
      current.studio ? `${intro}\n\n${contact}${telegram}`.trim() : legacySupport,
      new InlineKeyboard().text('📦 My Orders', 'orders:').text('🏠 Home', 'home:'),
    );
  }

  async function showTerms(screen: Screen): Promise<void> {
    const current = await storeContext();
    if (!current.termsOfService) {
      await show(bot, screen, `📜 <b>Terms & Policies</b>\n\nTerms are not configured yet.`, navRow(new InlineKeyboard()));
      return;
    }
    await show(bot, screen, `📜 <b>Terms & Policies</b>\n\n${escHtml(current.termsOfService.slice(0, 3000))}`, navRow(new InlineKeyboard()));
  }

  async function showApi(screen: Screen): Promise<void> {
    const origin = getAppUrl();
    await show(
      bot,
      screen,
      `🔑 <b>Developer API</b>\n\n` +
        `Integrate this store with the REST API.\n\n` +
        `📚 Docs:\n${escHtml(`${origin}/api-docs`)}\n\n` +
        `API keys:\n${escHtml(`${origin}/reseller/settings/api-keys`)}`,
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
      `🤝 <b>Become a Reseller</b>\n\n${escHtml(pitch)}\n\nTo get started, contact us:\n${escHtml(contact)}`,
      new InlineKeyboard().text('❓ Support', 'support:').text('🏠 Home', 'home:'),
    );
  }

  async function cancel(screen: Screen, orderId: string): Promise<void> {
    clearPending(screen.chatId);
    const order = await ownedOrder(orderId);
    if (!order) {
      await show(bot, screen, ERROR_TEXT.ORDER_NOT_FOUND ?? '', homeKeyboard(await storeContext()));
      return;
    }
    try {
      for (const [key, value] of awaitingEmail) {
        if (value.orderId === order.id) {
          awaitingEmail.delete(key);
        }
      }
      await cancelOrder(context.supabase, order.id, 'customer cancelled in telegram');
      await show(bot, screen, `❌ Order <code>${orderRef(order.id)}</code> was cancelled.`, homeKeyboard(await storeContext()));
    } catch (error: unknown) {
      logger.error('telegram cancel failed', {
        orderId,
        message: error instanceof Error ? error.message : 'unknown',
      });
      await show(
        bot,
        screen,
        `❌ <b>Could not cancel order</b>\n\nPlease try again or contact /support.`,
        homeKeyboard(await storeContext()),
      );
    }
  }

  async function onCallback(screen: Screen, data: string, _updateId: number): Promise<void> {
    if (data === 'home:' || data === 'home' || data === 'start:' || data === 'start') {
      await showHome(screen);
      return;
    }
    if (data === 'shop_all:') {
      await showShop(screen, undefined, 0, true);
      return;
    }
    if (data === 'shop:' || data === 'shop') {
      await showShop(screen);
      return;
    }
    if (data.startsWith('pg:')) {
      await showShop(screen, undefined, Number(data.slice(3)) || 0);
      return;
    }
    if (data.startsWith('cat:')) {
      const rest = data.slice(4);
      const [token, rawPage] = rest.split(':');
      if (token) {
        await showShop(screen, token, Number(rawPage) || 0);
      }
      return;
    }
    if (data.startsWith('product:')) {
      await showProduct(screen, data.slice('product:'.length));
      return;
    }
    if (data === 'sold:' || data === 'soldout:') {
      await show(bot, screen, ERROR_TEXT.OUT_OF_STOCK ?? '', homeKeyboard(await storeContext()));
      return;
    }
    if (data.startsWith('buy:')) {
      await handleBuy(screen, data.slice('buy:'.length));
      return;
    }
    if (data.startsWith('qty_type:')) {
      const productId = data.slice('qty_type:'.length);
      const item = (await loadCatalog()).find((entry) => entry.product.id === productId);
      if (!item) {
        await showHome(screen);
        return;
      }
      const maxQty = maxOrderQuantity(item.product);
      awaitingQty.set(emailKey(context.botConnection.id, screen.chatId), { productId, max: maxQty });
      await show(
        bot,
        screen,
        `✏️ Send a whole number from 1 to ${maxQty}.`,
        new InlineKeyboard().text('❌ Cancel', 'shop:'),
        'HTML',
      );
      return;
    }
    if (data.startsWith('qp:')) {
      const [, productId, rawQty] = data.split(':');
      const quantity = Number(rawQty);
      const item = (await loadCatalog()).find((entry) => entry.product.id === productId);
      if (!item || !Number.isInteger(quantity)) {
        await showHome(screen);
        return;
      }
      await placeOrder(screen, item, quantity);
      return;
    }
    if (data.startsWith('qty:')) {
      const [, orderId, rawQty] = data.split(':');
      const quantity = Number(rawQty);
      if (!orderId || !Number.isInteger(quantity)) {
        await showHome(screen);
        return;
      }
      const updated = await updateOrderQuantity(context.supabase, orderId, quantity);
      const title = (await loadCatalog()).find((entry) => entry.product.id === updated.productId)?.product.title ?? 'Product';
      await showPaymentOptions(screen, updated, title);
      return;
    }
    if (data.startsWith('pay_bp_manual:')) {
      await startBinance(screen, data.slice('pay_bp_manual:'.length));
      return;
    }
    if (data.startsWith('pay_bp:') || data.startsWith('pay:binance:')) {
      const orderId = data.startsWith('pay_bp:') ? data.slice('pay_bp:'.length) : data.slice('pay:binance:'.length);
      await startBinance(screen, orderId);
      return;
    }
    if (data.startsWith('pay_bep20:') || data.startsWith('pay_bep:') || data.startsWith('pay:bep20:')) {
      const orderId = data.startsWith('pay_bep20:')
        ? data.slice('pay_bep20:'.length)
        : data.startsWith('pay_bep:')
          ? data.slice('pay_bep:'.length)
          : data.slice('pay:bep20:'.length);
      await startBep20(screen, orderId);
      return;
    }
    if (data.startsWith('pay_trc20:')) {
      await startTrc20(screen, data.slice('pay_trc20:'.length));
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
    if (data.startsWith('pay_wallet:')) {
      await payFromWallet(screen, data.slice('pay_wallet:'.length));
      return;
    }
    if (data.startsWith('wallet_low:')) {
      const lowOrder = await ownedOrder(data.slice('wallet_low:'.length));
      const balance = customer?.creditBalanceMinor ?? 0n;
      const needed = lowOrder?.quotedRetailPriceMinor ?? 0n;
      await show(
        bot,
        screen,
        BOT_ERRORS.INSUFFICIENT_BALANCE(
          formatUsdt(needed),
          formatUsdt(balance),
          formatUsdt(needed > balance ? needed - balance : 0n),
        ),
        new InlineKeyboard().text('💳 Add Funds', 'deposit:').text('🏠 Home', 'home:'),
        'HTML',
      );
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
    if (data.startsWith('dep_for:')) {
      const order = await ownedOrder(data.slice('dep_for:'.length));
      if (!order) {
        await show(bot, screen, ERROR_TEXT.ORDER_NOT_FOUND ?? '', homeKeyboard(await storeContext()));
        return;
      }
      const current = await storeContext();
      const due = topUpAmount(order.quotedRetailPriceMinor, customer?.creditBalanceMinor ?? 0n, current.minimumDepositMinor);
      await markResumeAfterTopup(context.supabase, order.id);
      if (due !== null) {
        pendingTopup.set(emailKey(context.botConnection.id, screen.chatId), due);
      }
      await showDeposit(screen);
      return;
    }
    if (data === 'deposit:' || data === 'deposit') {
      pendingTopup.delete(emailKey(context.botConnection.id, screen.chatId));
      await showDeposit(screen);
      return;
    }
    if (data === 'dep_bep20:' || data === 'deposit_bep20:') {
      await showBep20Topup(screen);
      return;
    }
    if (data === 'topup_amounts:') {
      await showTopupAmount(screen);
      return;
    }
    if (data === 'topup_show:') {
      await refreshTopup(screen);
      return;
    }
    if (data.startsWith('topup_amt:')) {
      const raw = data.slice('topup_amt:'.length);
      if (/^\d+$/.test(raw)) {
        await showTopupInstructions(screen, BigInt(raw));
      }
      return;
    }
    if (data === 'topup_custom:') {
      awaitingTopupAmount.add(topupKey(screen.chatId));
      awaitingTopupHash.delete(topupKey(screen.chatId));
      const current = await storeContext();
      await show(
        bot,
        screen,
        `Type the amount in USDT. Minimum ${escHtml(formatUsdt(current.minimumDepositMinor))}.`,
        new InlineKeyboard().text('Cancel', 'topup_amounts:'),
        'HTML',
      );
      return;
    }
    if (data === 'topup_paid:') {
      awaitingTopupHash.add(topupKey(screen.chatId));
      awaitingTopupAmount.delete(topupKey(screen.chatId));
      await show(
        bot,
        screen,
        'Send the transaction hash now. It starts with 0x and has 64 characters after that.',
        new InlineKeyboard().text('⬅ Back', 'topup_show:'),
        'HTML',
      );
      return;
    }
    if (data === 'dep_bp:' || data === 'deposit_bp:') {
      await showBinanceTopup(screen);
      return;
    }
    if (data === 'dep_trc20:' || data === 'deposit_trc20:') {
      await showTrc20Topup(screen);
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
        await bot.api.sendMessage(screen.chatId, `<code>${escHtml(address)}</code>`, { parse_mode: 'HTML' });
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
    if (data === 'api_info:' || data === 'api:') {
      await showApi(screen);
      return;
    }
    if (data === 'refer:') {
      await showRefer(screen);
      return;
    }
    if (data === 'redeem_ask:') {
      await showRedeemConfirm(screen);
      return;
    }
    if (data === 'redeem_go:') {
      await confirmRedeem(screen);
      return;
    }
    if (data === 'freebies:') {
      await showFreebies(screen);
      return;
    }
    if (data.startsWith('freebie_claim:')) {
      await claimOneFreebie(screen, data.slice('freebie_claim:'.length));
      return;
    }
    if (data === 'copy_ref:') {
      await show(bot, screen, 'The referral link is in the message above. Tap and hold it to copy.', new InlineKeyboard().text('⬅ Menu', 'start:'), 'HTML');
      return;
    }
    if (data === 'reseller_signup:') {
      await showResellerSignup(screen);
      return;
    }
    await showHome(screen);
  }

  async function saveCheckoutEmail(screen: Screen, orderId: string, email: string, productTitle: string): Promise<void> {
    const { error } = await context.supabase
      .from('orders')
      .update({ metadata: { customerEmail: email }, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) {
      await show(bot, screen, BOT_ERRORS.GENERIC_ERROR, undefined, 'HTML');
      return;
    }
    awaitingEmail.delete(emailKey(context.botConnection.id, screen.chatId));
    const order = await ownedOrder(orderId);
    if (!order) {
      await show(bot, screen, BOT_ERRORS.ORDER_NOT_FOUND, homeKeyboard(await storeContext()), 'HTML');
      return;
    }
    await showPaymentOptions(screen, order, productTitle);
  }

  async function onText(screen: Screen, text: string): Promise<void> {
    const trimmed = text.trim();
    const pendingQty = awaitingQty.get(emailKey(context.botConnection.id, screen.chatId));
    if (pendingQty && /^[0-9]+$/.test(trimmed)) {
      const item = (await loadCatalog()).find((entry) => entry.product.id === pendingQty.productId);
      if (!item) {
        awaitingQty.delete(emailKey(context.botConnection.id, screen.chatId));
        await showHome(screen);
        return;
      }
      await placeOrder(screen, item, Number(trimmed));
      return;
    }
    if (pendingQty) {
      await show(
        bot,
        screen,
        `❌ Enter a whole number from 1 to ${pendingQty.max}.`,
        new InlineKeyboard().text('✏️ Type a number', `qty_type:${pendingQty.productId}`).text('❌ Cancel', 'shop:'),
        'HTML',
      );
      return;
    }
    const pendingEmail = awaitingEmail.get(emailKey(context.botConnection.id, screen.chatId));
    if (pendingEmail) {
      if (!isEmailAddress(trimmed)) {
        await show(
          bot,
          screen,
          "❌ That doesn't look like a valid email. Please send a valid email address.",
          new InlineKeyboard().text('❌ Cancel', `cancel_order:${pendingEmail.orderId}`),
          'HTML',
        );
        return;
      }
      await saveCheckoutEmail(screen, pendingEmail.orderId, trimmed, pendingEmail.productTitle);
      return;
    }
    const findKey = emailKey(context.botConnection.id, screen.chatId);
    if (awaitingFind.has(findKey)) {
      awaitingFind.delete(findKey);
      const code = trimmed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
      if (customer !== null && code.length >= 6) {
        const orders = await listOrders(context.supabase, { customerId: customer.id, limit: 30 });
        const match = orders.find((order) => order.id.toLowerCase().startsWith(code));
        if (match) {
          await showOrder(screen, match.id);
          return;
        }
      }
      await show(bot, screen, '❌ Order not found. Check the 8-character code and try /find again.', homeKeyboard(await storeContext()), 'HTML');
      return;
    }
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
    const topupStateKey = topupKey(screen.chatId);
    if (awaitingTopupAmount.has(topupStateKey)) {
      const current = await storeContext();
      const parsed = parseTopupAmount(trimmed, { min: current.minimumDepositMinor, max: current.maximumDepositMinor });
      if (!parsed.ok) {
        await show(bot, screen, `❌ ${escHtml(parsed.message)}`, new InlineKeyboard().text('Cancel', 'topup_amounts:'), 'HTML');
        return;
      }
      awaitingTopupAmount.delete(topupStateKey);
      await showTopupInstructions(screen, parsed.amountMinor);
      return;
    }
    if (awaitingTopupHash.has(topupStateKey)) {
      await claimTopupHash(screen, trimmed);
      return;
    }
    const manualOrderId = awaitingBinanceManual.get(topupStateKey);
    if (manualOrderId) {
      try {
        await submitBinanceManualReview(context.supabase, manualOrderId, trimmed);
        awaitingBinanceManual.delete(topupStateKey);
        await show(
          bot,
          screen,
          'Submitted for review. The order stays unpaid until the owner approves it in the dashboard.',
          homeKeyboard(await storeContext()),
          'HTML',
        );
      } catch (error: unknown) {
        const message = error instanceof ValidationError ? error.message : 'Could not submit that reference.';
        await show(bot, screen, `❌ ${escHtml(message)}`, homeKeyboard(await storeContext()), 'HTML');
      }
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
    await show(bot, screen, `🤔 I didn't understand that.\n\nUse the menu below to navigate:`, homeKeyboard(current));
  }

  bot.command('start', async (ctx) => {
    const payload = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (payload.startsWith('ref_')) {
      await acceptStartReferral(payload);
    }
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
  bot.command('menu', async (ctx) => {
    await showHome({ chatId: ctx.chat.id });
  });
  bot.command('profile', async (ctx) => {
    await showProfile({ chatId: ctx.chat.id });
  });
  bot.command('refer', async (ctx) => {
    await onCallback({ chatId: ctx.chat.id }, 'refer:', ctx.update.update_id);
  });
  bot.command('api', async (ctx) => {
    await showApi({ chatId: ctx.chat.id });
  });
  bot.command('terms', async (ctx) => {
    await showTerms({ chatId: ctx.chat.id });
  });
  bot.command('find', async (ctx) => {
    awaitingFind.add(emailKey(context.botConnection.id, ctx.chat.id));
    await show(
      bot,
      { chatId: ctx.chat.id },
      `🔍 <b>Find Order</b>\n\nSend your Order ID (8-character code):`,
      new InlineKeyboard().text('❌ Cancel', 'start:'),
      'HTML',
    );
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
            const callbackData = update.callback_query.data ?? '';
            await bot.api.answerCallbackQuery(
              update.callback_query.id,
              callbackData.startsWith('pay_wallet:') ? { text: 'Processing your payment...' } : {},
            );
            if (callbackData.startsWith('pay_wallet:')) {
              logger.info('wallet pay stage', {
                stage: 'callback_answer',
                orderId: callbackData.slice('pay_wallet:'.length),
                ms: 0,
              });
            }
          } catch (error: unknown) {
            logger.info('telegram callback answer skipped', {
              botId: context.botConnection.id,
              message: error instanceof Error ? error.message : 'unknown',
            });
          }
        }
        const customerKey = `${context.botConnection.id}:${identity.user.id}`;
        const cachedCustomer = CUSTOMER_CACHE.get(customerKey);
        const [opened, loadedStore] = await Promise.all([
          cachedCustomer && Date.now() <= cachedCustomer.expiresAt
            ? Promise.resolve({ customer: cachedCustomer.data, created: false })
            : openCustomer(context.supabase, context.botConnection.id, identity.user, identity.chatId),
          resolveBotContextCached(context.supabase, context.botConnection.id, context.tenantId),
          loadCatalog(),
        ]);
        customer = opened.customer;
        customerJustCreated = opened.created;
        CUSTOMER_CACHE.set(customerKey, { data: opened.customer, expiresAt: Date.now() + CUSTOMER_CACHE_MS });
        store = loadedStore;
        const commandsAt = COMMANDS_REFRESH.get(context.botConnection.id) ?? 0;
        if (Date.now() > commandsAt) {
          COMMANDS_REFRESH.set(context.botConnection.id, Date.now() + 3_600_000);
          void telegramSetMyCommands(botToken).catch(() => undefined);
        }
        if (customer.isBlocked) {
          await bot.api.sendMessage(identity.chatId, '🚫 <b>Account blocked</b>\n\nYour account has been blocked. Contact /support for assistance.', {
            parse_mode: 'HTML',
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
          void updateBotHealth(context.supabase, context.botConnection.id).catch((error: unknown) => {
            logger.info('telegram health update skipped', {
              botId: context.botConnection.id,
              message: error instanceof Error ? error.message : 'unknown',
            });
          });
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
            await bot.api.sendMessage(identity.chatId, BOT_ERRORS.GENERIC_ERROR, {
              parse_mode: 'HTML',
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
