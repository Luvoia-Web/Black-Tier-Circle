/**
 * Buyer-facing shop, product, quantity, and checkout copy.
 * Owner templates are sanitized. Every other value is escaped.
 * Money stays in bigint minor units.
 */

import { formatUsdt } from '@/lib/money';
import { chargedQuoteDisplay, orderTotals, visibleTiers, type BulkTier } from '@/modules/pricing/tiers';
import { sha256Hex } from '@/modules/catalog/sha256';
import { buyerFacingCategory } from '@/modules/catalog/buyer-category';
import { readCardHints } from '@/modules/catalog/card-text';
import type { Product } from '@/modules/catalog/types';
import { DEFAULT_CATALOG_TEMPLATES, LEGACY_CHECKOUT_HEADER } from '@/modules/store-config/defaults';
import { escapeHtml } from '@/modules/store-config/sanitize';
import { renderTemplate } from '@/modules/store-config/template';
import type { CatalogCategorySetting, CatalogTemplates } from '@/modules/store-config/types';

export const SHOP_PAGE_SIZE = 8;
export const DESCRIPTION_EXPAND_AT = 180;
export const BULK_DISCOUNT_HOOK = 'bulk-discounts';

export type ScreenButton = {
  readonly text: string;
  readonly data: string;
  readonly style?: 'success' | 'danger';
  readonly width?: 'half' | 'full';
};

export type ShopProduct = {
  readonly id: string;
  readonly title: string;
  readonly category: string | null;
  readonly priceMinor: bigint;
  readonly stockUnlimited: boolean;
  readonly stockCount: number | null;
  readonly supplierInStock?: boolean;
  readonly soldCount: number | null;
  readonly description: string | null;
  readonly durationText: string | null;
  readonly warrantyText: string | null;
  readonly typeLabel: string | null;
  readonly deliveryType: Product['deliveryType'];
  readonly requiresEmailActivation: boolean;
  readonly imageUrl?: string | null;
};

const EMPTY_WORDS = /^(n\/a|null|undefined|none)$/i;

export function categoryToken(name: string): string {
  return sha256Hex(name).slice(0, 12);
}

export function isSoldOut(
  product: Pick<ShopProduct, 'stockUnlimited' | 'stockCount'> & { readonly supplierInStock?: boolean },
): boolean {
  if (product.supplierInStock === false) {
    return true;
  }
  return !product.stockUnlimited && (product.stockCount ?? 0) <= 0;
}

export function topUpAmount(total: bigint, balance: bigint, minimum: bigint | null): bigint | null {
  if (total <= 0n || balance >= total) {
    return null;
  }
  const gap = total - balance;
  if (minimum !== null && minimum > gap) {
    return minimum;
  }
  return gap;
}

/**
 * Kept for the quantity-screen hook. Real copy is bulkOfferText.
 */
export function bulkDiscountLines(): string {
  return '';
}

export function buyerDollars(minor: bigint): string {
  const label = formatUsdt(minor).replace(/ USDT$/, '');
  return label.startsWith('-') ? `-$${label.slice(1)}` : `$${label}`;
}

/**
 * Buyer copy for bulk tiers. Prices come from the same helpers createOrder uses.
 * An empty string means there is nothing to show.
 */
export function bulkOfferText(input: {
  readonly baseUnit: bigint;
  readonly tiers: readonly BulkTier[];
  readonly floorMinor?: bigint | null;
  readonly templates?: Partial<CatalogTemplates>;
  readonly heading: 'card' | 'quantity';
  readonly quantity?: number;
  readonly quotedRetailMinor?: bigint;
}): string {
  const floor = input.floorMinor ?? null;
  const tiers = visibleTiers(input.baseUnit, input.tiers, floor);
  if (tiers.length === 0) {
    return '';
  }
  const templates = input.templates;
  const headingTemplate =
    input.heading === 'card'
      ? templates?.bulkDiscountHeading ?? DEFAULT_CATALOG_TEMPLATES.bulkDiscountHeading
      : templates?.bulkQuantityHeading ?? DEFAULT_CATALOG_TEMPLATES.bulkQuantityHeading;
  const heading = templateText(headingTemplate, input.heading === 'card' ? DEFAULT_CATALOG_TEMPLATES.bulkDiscountHeading : DEFAULT_CATALOG_TEMPLATES.bulkQuantityHeading, {});
  const lines = [heading];
  for (const tier of tiers) {
    lines.push(
      templateText(templates?.bulkTierLine, DEFAULT_CATALOG_TEMPLATES.bulkTierLine, {
        min: String(tier.minQty),
        price: buyerDollars(tier.unitPriceMinor),
      }),
    );
  }
  if (input.quantity !== undefined && input.quantity > 0) {
    const quote =
      input.quotedRetailMinor === undefined
        ? orderTotals({
            baseUnit: input.baseUnit,
            tiers,
            quantity: input.quantity,
            wholesaleUnit: 0n,
            floorMinor: floor,
          })
        : chargedQuoteDisplay({
            baseUnit: input.baseUnit,
            tiers,
            quantity: input.quantity,
            quotedRetailMinor: input.quotedRetailMinor,
            floorMinor: floor,
          });
    if (quote.tierApplied && quote.savingsMinor > 0n) {
      lines.push(
        templateText(templates?.bulkSavingsLine, DEFAULT_CATALOG_TEMPLATES.bulkSavingsLine, {
          qty: String(input.quantity),
          unit: buyerDollars(quote.unitRetailMinor),
          total: buyerDollars(quote.quotedRetailMinor),
          savings: buyerDollars(quote.savingsMinor),
        }),
      );
    }
  }
  return lines.filter((line) => line.trim().length > 0).join('\n');
}

export function bulkSavingsSentence(input: {
  readonly baseUnit: bigint;
  readonly tiers: readonly BulkTier[];
  readonly floorMinor?: bigint | null;
  readonly templates?: Partial<CatalogTemplates>;
  readonly quantity: number;
  readonly quotedRetailMinor?: bigint;
}): string {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return '';
  }
  const floor = input.floorMinor ?? null;
  const tiers = visibleTiers(input.baseUnit, input.tiers, floor);
  const quote =
    input.quotedRetailMinor === undefined
      ? orderTotals({
          baseUnit: input.baseUnit,
          tiers,
          quantity: input.quantity,
          wholesaleUnit: 0n,
          floorMinor: floor,
        })
      : chargedQuoteDisplay({
          baseUnit: input.baseUnit,
          tiers,
          quantity: input.quantity,
          quotedRetailMinor: input.quotedRetailMinor,
          floorMinor: floor,
        });
  if (!quote.tierApplied || quote.savingsMinor <= 0n) {
    return '';
  }
  return templateText(input.templates?.bulkSavingsLine, DEFAULT_CATALOG_TEMPLATES.bulkSavingsLine, {
    qty: String(input.quantity),
    unit: buyerDollars(quote.unitRetailMinor),
    total: buyerDollars(quote.quotedRetailMinor),
    savings: buyerDollars(quote.savingsMinor),
  });
}

export function layoutScreenButtons(buttons: readonly ScreenButton[]): ScreenButton[][] {
  const rows: ScreenButton[][] = [];
  let pending: ScreenButton | null = null;
  for (const button of buttons) {
    if (button.width === 'half') {
      if (pending) {
        rows.push([pending, button]);
        pending = null;
      } else {
        pending = button;
      }
      continue;
    }
    if (pending) {
      rows.push([pending]);
      pending = null;
    }
    rows.push([button]);
  }
  if (pending) {
    rows.push([pending]);
  }
  return rows;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function tidy(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

function present(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || EMPTY_WORDS.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function templateText(template: string | undefined, fallback: string, vars: Readonly<Record<string, string>>): string {
  const chosen = present(template) ?? fallback;
  const rendered = tidy(renderTemplate(chosen, vars));
  if (rendered.length === 0) {
    return tidy(renderTemplate(fallback, vars));
  }
  return rendered;
}

function hintsOf(product: Pick<ShopProduct, 'durationText' | 'warrantyText' | 'typeLabel'> & { supplierMetadata?: Record<string, unknown> }): {
  duration: string | null;
  warranty: string | null;
  typeLabel: string | null;
} {
  const hints = readCardHints(product.supplierMetadata ?? {});
  return {
    duration: present(product.durationText) ?? hints.durationText,
    warranty: present(product.warrantyText) ?? hints.warrantyText,
    typeLabel: present(product.typeLabel) ?? hints.typeLabel,
  };
}

export function resolvedWarranty(product: ShopProduct & { supplierMetadata?: Record<string, unknown> }): string | null {
  return hintsOf(product).warranty;
}

export function buyerTypeLabel(product: ShopProduct & { supplierMetadata?: Record<string, unknown> }): string {
  const hints = hintsOf(product);
  if (hints.typeLabel) {
    return hints.typeLabel;
  }
  if (product.requiresEmailActivation) {
    return 'Activation link';
  }
  if (product.deliveryType === 'manual') {
    return 'Manual';
  }
  return 'Instant';
}

export function needsManualFooter(product: Pick<ShopProduct, 'deliveryType' | 'requiresEmailActivation'>): boolean {
  return product.deliveryType === 'manual' || product.requiresEmailActivation;
}

function categorySetting(
  name: string,
  settings: Readonly<Record<string, CatalogCategorySetting>> | undefined,
): CatalogCategorySetting {
  return (
    settings?.[name] ?? {
      emoji: '',
      displayName: '',
      description: '',
      sortOrder: 0,
      hidden: false,
    }
  );
}

export function visibleCategories(
  names: readonly string[],
  settings: Readonly<Record<string, CatalogCategorySetting>> | undefined,
): Array<{ name: string; label: string; emoji: string; description: string; token: string }> {
  return [...new Set(names)]
    .map((name) => {
      const setting = categorySetting(name, settings);
      return { name, setting };
    })
    .filter((entry) => !entry.setting.hidden)
    .sort((left, right) => {
      if (left.setting.sortOrder !== right.setting.sortOrder) {
        return left.setting.sortOrder - right.setting.sortOrder;
      }
      const leftLabel = present(left.setting.displayName) ?? left.name;
      const rightLabel = present(right.setting.displayName) ?? right.name;
      return leftLabel.localeCompare(rightLabel);
    })
    .map((entry) => ({
      name: entry.name,
      label: present(entry.setting.displayName) ?? entry.name,
      emoji: present(entry.setting.emoji) ?? '📂',
      description: present(entry.setting.description) ?? '',
      token: categoryToken(entry.name),
    }));
}

function productButton(product: ShopProduct, emoji: string): ScreenButton {
  const soldOut = isSoldOut(product);
  const stock = soldOut ? 'Sold out' : product.stockUnlimited ? '∞' : String(product.stockCount ?? 0);
  const prefix = soldOut ? '❌' : emoji;
  return {
    text: clip(`${prefix} ${product.title} | ${formatUsdt(product.priceMinor)} | ${stock}`, 64),
    data: soldOut ? 'soldout:' : `product:${product.id}`,
    ...(soldOut ? { style: 'danger' as const } : {}),
    width: 'full',
  };
}

export function renderShop(input: {
  readonly products: readonly ShopProduct[];
  readonly settings?: Readonly<Record<string, CatalogCategorySetting>>;
  readonly templates?: Partial<CatalogTemplates>;
  readonly page?: number;
  readonly categoryToken?: string;
  readonly showAll?: boolean;
}): { readonly text: string; readonly rows: ScreenButton[][] } {
  const templates = input.templates ?? {};
  const names = input.products.map((product) => product.category).filter((name): name is string => present(name) !== null);
  const categories = visibleCategories(names, input.settings);
  const hidden = new Set(
    names.filter((name) => categorySetting(name, input.settings).hidden),
  );
  const buttons: ScreenButton[] = [];
  let text = templateText(templates.categoriesHeader, DEFAULT_CATALOG_TEMPLATES.categoriesHeader, { store: '' });
  const browsingHome = !input.showAll && input.categoryToken === undefined && categories.length > 0;
  if (browsingHome) {
    for (const category of categories) {
      buttons.push({
        text: clip(`${category.emoji} ${category.label}`, 40),
        data: `cat:${category.token}:0`,
        width: 'half',
      });
    }
    for (const product of input.products) {
      if (product.category === null || hidden.has(product.category)) {
        if (product.category !== null) {
          continue;
        }
        buttons.push(productButton(product, '📦'));
      }
    }
  } else {
    const category = categories.find((entry) => entry.token === input.categoryToken) ?? null;
    const visible = input.products.filter((product) => {
      if (input.categoryToken === undefined || input.showAll) {
        return product.category === null || !hidden.has(product.category);
      }
      return product.category !== null && categoryToken(product.category) === input.categoryToken;
    });
    if (category) {
      text = templateText(templates.productListHeader, DEFAULT_CATALOG_TEMPLATES.productListHeader, {
        emoji: category.emoji,
        name: category.label,
        description: category.description,
        count: String(visible.length),
      });
    } else {
      text = 'Select a product:';
    }
    for (const product of visible) {
      const emoji = category?.emoji ?? '📦';
      buttons.push(productButton(product, emoji));
    }
  }
  const pages = Math.max(1, Math.ceil(buttons.length / SHOP_PAGE_SIZE));
  const page = Math.min(Math.max(input.page ?? 0, 0), pages - 1);
  const slice = buttons.slice(page * SHOP_PAGE_SIZE, page * SHOP_PAGE_SIZE + SHOP_PAGE_SIZE);
  const nav: ScreenButton[] = [];
  const token = input.categoryToken;
  if (pages > 1 && page > 0) {
    nav.push({
      text: '⬅ Prev',
      data: token ? `cat:${token}:${page - 1}` : `pg:${page - 1}`,
      width: 'half',
    });
  }
  if (pages > 1 && page < pages - 1) {
    nav.push({
      text: 'Next ➡',
      data: token ? `cat:${token}:${page + 1}` : `pg:${page + 1}`,
      width: 'half',
    });
  }
  if (token) {
    nav.push({ text: '⬅ Back', data: 'shop:', width: 'half' });
  }
  nav.push({ text: '🏠 Home', data: 'home:', width: token ? 'half' : 'full' });
  return { text, rows: layoutScreenButtons([...slice, ...nav]) };
}

function descriptionBlock(description: string | null): string | null {
  const text = present(description);
  if (!text) {
    return null;
  }
  const safe = escapeHtml(text);
  const body = text.length > DESCRIPTION_EXPAND_AT ? `<blockquote expandable>${safe}</blockquote>` : safe;
  return `<b>Description</b>\n${body}`;
}

export type ProductCardField = 'image' | 'name' | 'price' | 'duration' | 'warranty' | 'stock' | 'sold' | 'type';

export type ProductCardSettings = {
  readonly fields: readonly ProductCardField[];
  readonly showImage: boolean;
  readonly fallbackEmoji: string;
};

function stockLine(product: ShopProduct): string {
  if (isSoldOut(product)) {
    return 'Stock: Sold out';
  }
  if (product.stockUnlimited) {
    return 'Stock: Unlimited';
  }
  const count = product.stockCount ?? 0;
  return `Stock: ${count} ${count === 1 ? 'item' : 'items'}`;
}

function cardLine(product: ShopProduct, field: ProductCardField, card: ProductCardSettings, hints: ReturnType<typeof hintsOf>): string | null {
  if (field === 'image') {
    if (!card.showImage) {
      return null;
    }
    return product.imageUrl ? null : card.fallbackEmoji;
  }
  if (field === 'name') {
    return `<b>${escapeHtml(product.title)}</b>`;
  }
  if (field === 'price') {
    return `Price: <b>${escapeHtml(formatUsdt(product.priceMinor))}</b>`;
  }
  if (field === 'duration') {
    return hints.duration ? `Duration: ${escapeHtml(hints.duration)}` : null;
  }
  if (field === 'warranty') {
    return hints.warranty ? `Warranty: ${escapeHtml(hints.warranty)}` : null;
  }
  if (field === 'stock') {
    return stockLine(product);
  }
  if (field === 'sold') {
    return typeof product.soldCount === 'number' && Number.isFinite(product.soldCount) ? `Sold: ${product.soldCount}` : null;
  }
  return `Type: ${escapeHtml(buyerTypeLabel(product))}`;
}

export function productCardText(
  product: ShopProduct & { supplierMetadata?: Record<string, unknown> },
  templates?: Partial<CatalogTemplates>,
  bulk?: string,
  card?: ProductCardSettings,
): string {
  const hints = hintsOf(product);
  const lines: Array<string | null> = card
    ? card.fields.map((field) => cardLine(product, field, card, hints))
    : [
        `<b>${escapeHtml(product.title)}</b>`,
        `Price: <b>${escapeHtml(formatUsdt(product.priceMinor))}</b>`,
        hints.duration ? `Duration: ${escapeHtml(hints.duration)}` : null,
        hints.warranty ? `Warranty: ${escapeHtml(hints.warranty)}` : null,
        stockLine(product),
        `Type: ${escapeHtml(buyerTypeLabel(product))}`,
        typeof product.soldCount === 'number' && Number.isFinite(product.soldCount) ? `Sold: ${product.soldCount}` : null,
      ];
  const description = descriptionBlock(product.description);
  if (description) {
    lines.push('', description);
  }
  const offer = present(bulk);
  if (offer) {
    lines.push('', offer);
  }
  const footer = templateText(
    needsManualFooter(product) ? templates?.productFooterManual : templates?.productFooterInstant,
    needsManualFooter(product) ? DEFAULT_CATALOG_TEMPLATES.productFooterManual : DEFAULT_CATALOG_TEMPLATES.productFooterInstant,
    { product: product.title },
  );
  if (footer) {
    lines.push('', footer);
  }
  return lines.filter((line) => line !== null).join('\n');
}

export function productCardButtons(product: ShopProduct, buyable = true): ScreenButton[] {
  const buy: ScreenButton = !buyable || isSoldOut(product)
    ? { text: '❌ Sold out', data: 'soldout:', style: 'danger', width: 'full' }
    : { text: 'Buy Now', data: `buy:${product.id}`, style: 'success', width: 'full' };
  return [
    buy,
    { text: '⬅ Back', data: 'shop:', width: 'half' },
    { text: '🏠 Home', data: 'home:', width: 'half' },
  ];
}

export function quantityText(product: ShopProduct, priceMinor: bigint, maxQty: number, bulkSection?: string): string {
  const stock = isSoldOut(product) ? 'Sold out' : product.stockUnlimited ? 'Unlimited' : String(product.stockCount ?? 0);
  const lines = [
    `<b>${escapeHtml(product.title)}</b>`,
    `Unit price: <b>${escapeHtml(formatUsdt(priceMinor))}</b>`,
    `Stock: ${escapeHtml(stock)}`,
    'How many do you want?',
  ];
  const bulk = (bulkSection ?? bulkDiscountLines()).trim();
  if (bulk.length > 0) {
    lines.push(bulk);
  }
  lines.push(`Choose a button or send a whole number from 1 to ${maxQty}.`);
  return lines.join('\n');
}

export function checkoutTitle(template: string | null | undefined): string {
  const value = template?.trim() ?? '';
  if (value.length === 0 || value === LEGACY_CHECKOUT_HEADER) {
    return '<b>Checkout</b>';
  }
  return templateText(value, '<b>Checkout</b>', {});
}

export function checkoutText(input: {
  readonly title: string;
  readonly productTitle: string;
  readonly quantity: number;
  readonly warranty: string | null;
  readonly totalMinor: bigint;
  readonly unitMinor?: bigint;
  readonly confirmation?: string;
  readonly balanceMinor: bigint;
  readonly windowLine: string;
  readonly shortfallTemplate?: string;
  readonly minimumDepositMinor: bigint | null;
  readonly demoNotice?: string | null;
  readonly paymentsNotice?: string | null;
}): string {
  const lines = [
    checkoutTitle(input.title),
    `${escapeHtml(input.productTitle)} x ${input.quantity}`,
  ];
  const warranty = present(input.warranty);
  if (warranty) {
    lines.push(`Warranty: ${escapeHtml(warranty)}`);
  }
  if (input.unitMinor !== undefined) {
    lines.push(`Unit price: <b>${escapeHtml(buyerDollars(input.unitMinor))}</b>`);
  }
  lines.push(`Quantity: ${input.quantity}`);
  lines.push(`Total: <b>${escapeHtml(formatUsdt(input.totalMinor))}</b>`);
  const confirmation = present(input.confirmation);
  if (confirmation) {
    lines.push(confirmation);
  }
  lines.push(`Balance: ${escapeHtml(formatUsdt(input.balanceMinor))}`);
  const windowLine = present(input.windowLine);
  if (windowLine) {
    lines.push(windowLine);
  }
  const due = topUpAmount(input.totalMinor, input.balanceMinor, input.minimumDepositMinor);
  if (due !== null) {
    lines.push(
      templateText(input.shortfallTemplate, DEFAULT_CATALOG_TEMPLATES.checkoutShortfall, {
        shortfall: formatUsdt(due),
      }),
    );
  }
  const demo = present(input.demoNotice);
  if (demo) {
    lines.push(demo);
  }
  const paymentsNotice = present(input.paymentsNotice);
  if (paymentsNotice) {
    lines.push(paymentsNotice);
  }
  return lines.join('\n');
}

export function checkoutButtons(input: {
  readonly orderId: string;
  readonly productId: string;
  readonly totalMinor: bigint;
  readonly balanceMinor: bigint;
  readonly minimumDepositMinor: bigint | null;
  readonly binance: boolean;
  readonly bep20: boolean;
  readonly trc20: boolean;
  readonly demo: boolean;
  readonly binanceManual?: boolean;
}): ScreenButton[] {
  const buttons: ScreenButton[] = [];
  const due = topUpAmount(input.totalMinor, input.balanceMinor, input.minimumDepositMinor);
  if (due === null && input.balanceMinor >= input.totalMinor && input.totalMinor > 0n) {
    buttons.push({
      text: clip(`Pay with Wallet (${formatUsdt(input.balanceMinor)})`, 64),
      data: `pay_wallet:${input.orderId}`,
      style: 'success',
      width: 'full',
    });
  }
  if (due !== null) {
    buttons.push({
      text: clip(`Add ${formatUsdt(due)} to wallet`, 64),
      data: `dep_for:${input.orderId}`,
      width: 'full',
    });
  }
  if (input.binance) {
    buttons.push({ text: 'Pay with Binance Pay', data: `pay_bp:${input.orderId}`, style: 'success', width: 'full' });
  }
  const both = input.bep20 && input.trc20;
  if (input.bep20) {
    buttons.push({
      text: both ? 'Pay with Crypto (BEP20)' : 'Pay with Crypto',
      data: `pay_bep20:${input.orderId}`,
      style: 'success',
      width: 'full',
    });
  }
  if (input.trc20) {
    buttons.push({
      text: both ? 'Pay with Crypto (TRC20)' : 'Pay with Crypto',
      data: `pay_trc20:${input.orderId}`,
      style: 'success',
      width: 'full',
    });
  }
  if (input.demo) {
    buttons.push({ text: 'Test Payment (Demo)', data: `pay_demo:${input.orderId}`, style: 'success', width: 'full' });
  }
  if (input.binanceManual) {
    buttons.push({
      text: 'Binance Pay — request review',
      data: `pay_bp_manual:${input.orderId}`,
      width: 'full',
    });
  }
  buttons.push({ text: '⬅ Back', data: `product:${input.productId}`, width: 'half' });
  buttons.push({ text: 'Cancel', data: `cancel_order:${input.orderId}`, style: 'danger', width: 'half' });
  return buttons;
}

export function depositAmountLine(amountMinor: bigint | null): string {
  if (amountMinor === null || amountMinor <= 0n) {
    return '';
  }
  return `Amount: <b>${escapeHtml(formatUsdt(amountMinor))}</b>`;
}

export const BALANCE_ADDED_TEXT = 'Balance added. Tap below to complete your order.';
export const BALANCE_EXPIRED_TEXT = 'This order expired. Start again to buy it.';

export function shopProductFrom(product: Product, priceMinor: bigint, soldCount: number | null): ShopProduct & { supplierMetadata: Record<string, unknown> } {
  return {
    id: product.id,
    title: product.title,
    category: buyerFacingCategory(product),
    priceMinor,
    stockUnlimited: product.stockUnlimited,
    stockCount: product.stockCount,
    supplierInStock: product.supplierInStock,
    soldCount,
    description: product.description,
    durationText: product.durationText,
    warrantyText: product.warrantyText,
    typeLabel: product.typeLabel,
    deliveryType: product.deliveryType,
    requiresEmailActivation: product.requiresEmailActivation,
    supplierMetadata: product.supplierMetadata,
  };
}
