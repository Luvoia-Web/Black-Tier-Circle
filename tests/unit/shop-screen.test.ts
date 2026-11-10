import { describe, expect, it } from 'vitest';
import { InlineKeyboard } from 'grammy';
import { loadSoldCounts } from '@/modules/catalog/sold-count';
import {
  BALANCE_ADDED_TEXT,
  bulkDiscountLines,
  checkoutButtons,
  checkoutText,
  depositAmountLine,
  productCardButtons,
  productCardText,
  quantityText,
  renderShop,
  categoryToken,
  topUpAmount,
  type ShopProduct,
} from '@/modules/catalog/shop-screen';
import { claimCheckoutResume, markResumeAfterTopup } from '@/modules/orders/balance-notice';
import { sanitizeBotHtml } from '@/modules/store-config/sanitize';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

function product(overrides: Partial<ShopProduct> = {}): ShopProduct {
  return {
    id: 'p1',
    title: 'Sample key',
    category: 'Keys',
    priceMinor: 5_000_000n,
    stockUnlimited: false,
    stockCount: 4,
    soldCount: 2,
    description: 'A short note.',
    durationText: null,
    warrantyText: null,
    typeLabel: null,
    deliveryType: 'inventory_unit',
    requiresEmailActivation: false,
    ...overrides,
  };
}

function assertClean(text: string): void {
  expect(text).not.toMatch(/\bundefined\b/i);
  expect(text).not.toMatch(/\bnull\b/i);
  expect(text).not.toMatch(/\bN\/A\b/i);
}

describe('shop screens', () => {
  it('orders categories, hides one, and places two category buttons on a row', () => {
    const view = renderShop({
      products: [
        product({ id: 'a', category: 'Zebra', title: 'Late' }),
        product({ id: 'b', category: 'Alpha', title: 'Early' }),
        product({ id: 'c', category: null, title: 'Loose' }),
        product({ id: 'd', category: 'Hidden', title: 'Secret' }),
      ],
      settings: {
        Zebra: { emoji: '🦓', displayName: 'Zebra', description: '', sortOrder: 2, hidden: false },
        Alpha: { emoji: '✨', displayName: '', description: 'Fresh', sortOrder: 0, hidden: false },
        Hidden: { emoji: '🙈', displayName: 'Hidden', description: '', sortOrder: 1, hidden: true },
      },
    });
    const flat = view.rows.flat();
    expect(flat[0]?.text).toContain('✨');
    expect(flat[0]?.text).toContain('Alpha');
    expect(flat[1]?.text).toContain('🦓');
    expect(view.rows[0]).toHaveLength(2);
    expect(flat.some((button) => button.text.includes('Hidden') || button.text.includes('Secret'))).toBe(false);
    expect(flat.some((button) => button.text.includes('Loose'))).toBe(true);
    expect(flat.at(-1)?.data).toBe('home:');
    assertClean(view.text);
    expect(view.text).toContain('Categories');
    expect(view.text).toContain('Pick a category to browse.');
  });

  it('falls back when a template is empty and shows the category line', () => {
    const view = renderShop({
      products: [product()],
      settings: { Keys: { emoji: '🔑', displayName: 'Keys', description: 'One line', sortOrder: 1, hidden: false } },
      templates: { categoriesHeader: '   ', productListHeader: '' },
      categoryToken: categoryToken('Keys'),
    });
    expect(view.text).toContain('🔑');
    expect(view.text).toContain('Keys');
    expect(view.text).toContain('One line');
    expect(view.text).toContain('1 products - tap one to see the details.');
    assertClean(view.text);
  });

  it('hides empty card fields and does not sell a sold-out item', () => {
    const card = productCardText(product({ description: null, soldCount: null }));
    expect(card).toContain('Price:');
    expect(card).toContain('Stock: 4 items');
    expect(card).toContain('Type: Instant');
    expect(card).not.toContain('Duration');
    expect(card).not.toContain('Warranty');
    expect(card).not.toContain('Description');
    expect(card).not.toContain('Sold:');
    expect(card).toContain('Automatic delivery after payment.');
    assertClean(card);
    const filled = productCardText(
      product({
        durationText: '12 months',
        warrantyText: '30 days',
        typeLabel: 'Activation link',
        description: `${'Long description. '.repeat(20)}<tag>`,
        deliveryType: 'manual',
        soldCount: 3,
      }),
    );
    expect(filled).toContain('Duration: 12 months');
    expect(filled).toContain('Warranty: 30 days');
    expect(filled).toContain('Type: Activation link');
    expect(filled).toContain('Sold: 3');
    expect(filled).toContain('<blockquote expandable>');
    expect(filled).toContain('&lt;tag&gt;');
    expect(filled).toContain('The store delivers this after payment.');
    assertClean(filled);
    const sold = product({ stockCount: 0 });
    const button = productCardButtons(sold)[0];
    expect(button?.data).toBe('soldout:');
    expect(button?.style).toBe('danger');
    expect(button?.text).toContain('Sold out');
    const row = renderShop({ products: [sold], showAll: true }).rows.flat().find((entry) => entry.text.includes('Sample'));
    expect(row?.data).toBe('soldout:');
    expect(row?.data).not.toContain(sold.id);
  });

  it('keeps the quantity buttons hook empty and shows price and stock', () => {
    expect(bulkDiscountLines()).toBe('');
    const text = quantityText(product(), 5_000_000n, 4);
    expect(text).toContain('Unit price:');
    expect(text).toContain('5.00 USDT');
    expect(text).toContain('Stock: 4');
    expect(text).toContain('How many do you want?');
    expect(text.indexOf('How many do you want?')).toBeLessThan(text.indexOf('Choose a button'));
    expect(text).not.toContain('discount');
    const withHook = quantityText(product(), 5_000_000n, 4, 'BULK_DISCOUNT_HOOK');
    expect(withHook.indexOf('How many do you want?')).toBeLessThan(withHook.indexOf('BULK_DISCOUNT_HOOK'));
    assertClean(text);
  });

  it('rounds a shortfall up to the minimum and orders the pay buttons', () => {
    expect(topUpAmount(5_000_000n, 0n, 1_000_000n)).toBe(5_000_000n);
    expect(topUpAmount(400_000n, 0n, 1_000_000n)).toBe(1_000_000n);
    expect(topUpAmount(2_000_000n, 2_000_000n, 1_000_000n)).toBeNull();
    expect(topUpAmount(3_000_000n, 1_500_000n, null)).toBe(1_500_000n);
    const short = checkoutText({
      title: '✅ <b>Order Summary</b>',
      productTitle: 'Sample key',
      quantity: 1,
      warranty: null,
      totalMinor: 400_000n,
      balanceMinor: 0n,
      windowLine: 'You have 15 minutes to complete this payment.',
      minimumDepositMinor: 1_000_000n,
    });
    expect(short.startsWith('<b>Checkout</b>')).toBe(true);
    expect(short).toContain('Sample key x 1');
    expect(short).not.toContain('Warranty');
    expect(short).toContain('You need 1.00 USDT more');
    assertClean(short);
    const covered = checkoutText({
      title: '<b>Checkout</b>',
      productTitle: 'Sample key',
      quantity: 2,
      warranty: '30 days',
      totalMinor: 2_000_000n,
      balanceMinor: 3_000_000n,
      windowLine: 'You have 15 minutes to complete this payment.',
      minimumDepositMinor: 1_000_000n,
    });
    expect(covered).toContain('Warranty: 30 days');
    expect(covered).not.toContain('more to pay');
    const shortButtons = checkoutButtons({
      orderId: 'order-1',
      productId: 'p1',
      totalMinor: 400_000n,
      balanceMinor: 0n,
      minimumDepositMinor: 1_000_000n,
      binance: true,
      bep20: true,
      trc20: true,
      demo: false,
    });
    expect(shortButtons.map((button) => button.text)).toEqual([
      'Add 1.00 USDT to wallet',
      'Pay with Binance Pay',
      'Pay with Crypto (BEP20)',
      'Pay with Crypto (TRC20)',
      '⬅ Back',
      'Cancel',
    ]);
    expect(shortButtons[0]?.data).toBe('dep_for:order-1');
    expect(shortButtons[1]?.style).toBe('success');
    expect(shortButtons.at(-1)?.style).toBe('danger');
    const paid = checkoutButtons({
      orderId: 'order-1',
      productId: 'p1',
      totalMinor: 2_000_000n,
      balanceMinor: 3_000_000n,
      minimumDepositMinor: 1_000_000n,
      binance: false,
      bep20: true,
      trc20: false,
      demo: false,
    });
    expect(paid[0]?.text).toContain('Pay with Wallet');
    expect(paid[0]?.style).toBe('success');
    expect(paid.some((button) => button.text.startsWith('Add '))).toBe(false);
    expect(paid.find((button) => button.data.startsWith('pay_bep20'))?.text).toBe('Pay with Crypto');
    expect(depositAmountLine(1_000_000n)).toContain('1.00 USDT');
    expect(depositAmountLine(null)).toBe('');
  });

  it('styles buy and pay buttons without changing callback data', () => {
    const keyboard = new InlineKeyboard().text('Buy Now', 'buy:p1').success().row().text('Cancel', 'cancel_order:1').danger();
    expect(keyboard.inline_keyboard[0]?.[0]).toMatchObject({ text: 'Buy Now', callback_data: 'buy:p1', style: 'success' });
    expect(keyboard.inline_keyboard[1]?.[0]).toMatchObject({ callback_data: 'cancel_order:1', style: 'danger' });
  });
});

describe('sold counts and balance notice', () => {
  it('sums verified quantity for the store and hides nothing on a failed read', async () => {
    const db = createMemoryDb({
      orders: [
        { product_id: 'p1', quantity: 2, payment_status: 'verified', tenant_id: null },
        { product_id: 'p1', quantity: 1, payment_status: 'awaiting', tenant_id: null },
        { product_id: 'p1', quantity: 9, payment_status: 'verified', tenant_id: 'tenant-a' },
      ],
    });
    const owner = await loadSoldCounts(db, ['p1', 'p2'], null);
    expect(owner?.get('p1')).toBe(2);
    expect(owner?.get('p2')).toBe(0);
    const reseller = await loadSoldCounts(db, ['p1'], 'tenant-a');
    expect(reseller?.get('p1')).toBe(9);
  });

  it('sends the balance added message once and says when the order expired', async () => {
    const db = createMemoryDb({
      orders: [
        {
          id: 'order-1',
          customer_id: 'customer-1',
          product_id: 'p1',
          payment_status: 'awaiting',
          created_at: new Date().toISOString(),
          metadata: {},
        },
      ],
    });
    await markResumeAfterTopup(db, 'order-1');
    const sent: string[] = [];
    const first = await claimCheckoutResume(db, 'customer-1');
    if (first.kind === 'resume') {
      sent.push(BALANCE_ADDED_TEXT);
    }
    const second = await claimCheckoutResume(db, 'customer-1');
    if (second.kind === 'resume') {
      sent.push(BALANCE_ADDED_TEXT);
    }
    expect(first).toEqual({ kind: 'resume', orderId: 'order-1' });
    expect(second.kind).toBe('skip');
    expect(sent).toEqual([BALANCE_ADDED_TEXT]);
    expect(sent.join('\n')).not.toMatch(/\bundefined\b|\bnull\b/i);

    const expiredDb = createMemoryDb({
      orders: [
        {
          id: 'order-2',
          customer_id: 'customer-1',
          product_id: 'p9',
          payment_status: 'awaiting',
          created_at: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
          metadata: { resume_after_topup: true },
        },
      ],
    });
    const expired = await claimCheckoutResume(expiredDb, 'customer-1');
    expect(expired).toEqual({ kind: 'expired', orderId: 'order-2', productId: 'p9' });
    expect(await claimCheckoutResume(expiredDb, 'customer-1')).toEqual({ kind: 'skip' });
  });
});

describe('blockquote sanitizer', () => {
  it('keeps an expandable quote and drops other attributes', () => {
    expect(sanitizeBotHtml('<blockquote expandable>Hello</blockquote>')).toBe('<blockquote expandable>Hello</blockquote>');
    expect(sanitizeBotHtml('<blockquote onclick="x">Hello</blockquote>')).toBe('Hello');
  });
});
