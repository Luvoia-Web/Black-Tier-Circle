import type { ButtonKey, CatalogTemplates, ReferralConfig, StoreButton, StoreConfig } from '@/modules/store-config/types';
import { BUTTON_KEYS } from '@/modules/store-config/types';

const DEFAULT_WELCOME =
  '👋 <b>Welcome, {name}!</b>\n\n' +
  '{store} is open. Browse the shop, add funds, and pick up your order in this chat.\n\n' +
  '• Shop — see what is for sale\n' +
  '• Deposit — add funds to your balance\n' +
  '• Profile — your orders and account\n' +
  '• Support — talk to the store\n\n' +
  '{channel}\n{group}\n{website}\n\n' +
  'Balance: <b>{balance}</b>\n\n' +
  'Choose an option below.';

function button(
  label: string,
  emoji: string,
  width: StoreButton['width'],
  order: number,
  enabled: boolean,
): StoreButton {
  return { enabled, label, emoji, width, order };
}

const BUTTONS: Record<ButtonKey, StoreButton> = {
  shop: button('Browse Shop', '🛍', 'full', 0, true),
  freebies: button('Freebies', '🎁', 'full', 1, true),
  deposit: button('Deposit', '💳', 'half', 2, true),
  profile: button('Profile', '👤', 'half', 3, true),
  support: button('Support', '❓', 'full', 4, true),
  referrals: button('Refer & Earn', '🎁', 'full', 5, true),
  history: button('History', '📦', 'half', 6, false),
  redeem: button('Redeem', '🔑', 'half', 7, false),
  events: button('Events', '🎉', 'full', 8, false),
  terms: button('Terms', '📜', 'full', 9, false),
  reseller_signup: button('Become a Reseller', '🤝', 'full', 10, false),
  api: button('My API', '🔑', 'half', 11, false),
};

export const DEFAULT_CATALOG_TEMPLATES: CatalogTemplates = {
  categoriesHeader: '<b>Categories</b>\nPick a category to browse.',
  productListHeader: '{emoji} <b>{name}</b>\n{description}\n{count} products - tap one to see the details.',
  productFooterInstant: 'Automatic delivery after payment.',
  productFooterManual: 'The store delivers this after payment.',
  checkoutShortfall: 'You need {shortfall} more to pay from your balance.',
  bulkDiscountHeading: '<b>BULK DISCOUNT</b>',
  bulkQuantityHeading: '<b>BUY MORE, PAY LESS</b>',
  bulkTierLine: '{min}+ pcs - {price} each',
  bulkSavingsLine: '{qty} x {unit} = {total}, you save {savings}',
};

export const DEFAULT_REFERRAL_CONFIG: ReferralConfig = {
  enabled: false,
  pointsPerReferral: 1,
  pointValueMinor: '200000',
  minRedeemPoints: 5,
  minQualifyingOrderMinor: '1',
  dailyRewardCap: 20,
  freebiesEnabled: false,
  redeemEnabled: true,
  templates: {
    home: '<b>Refer & Earn</b>\nShare your link. You earn points when a new friend pays for a product.',
    freebies: '<b>Freebies</b>\nRewards unlock as your friends pay.',
    friendJoined: 'A friend joined. {name}',
    qualified: 'Your referral qualified. You earned {points} points.',
    redeemed: 'You redeemed {points} points for {amount}.',
  },
};

export const LEGACY_CHECKOUT_HEADER = '✅ <b>Order Summary</b>';

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  welcome: DEFAULT_WELCOME,
  buttons: BUTTONS,
  customLinks: [],
  links: {
    channel: { label: 'Channel', url: '' },
    group: { label: 'Group', url: '' },
    website: { label: 'Website', url: '' },
  },
  messages: {
    supportIntro: '❓ <b>Support</b>\n\nInclude your <b>Order ID</b> when asking about an order.\nUse /orders to find it.',
    checkoutHeader: '✅ <b>Order Summary</b>',
    orderProcessing: '⏳ <b>Processing your order...</b>\n\nPlease wait a few seconds. Do not tap again.',
    orderDelivered:
      '✅ <b>Your order is delivered</b>\n\n📦 {product}\n🔢 Quantity: {quantity}\n💵 Paid: {total}\n💰 Remaining balance: <b>{balance}</b>\n🔖 Order: <code>{order}</code>\n\n<code>{content}</code>',
  },
  catalog: {
    categories: {},
    templates: DEFAULT_CATALOG_TEMPLATES,
  },
  productCard: {
    fields: ['name', 'price', 'duration', 'warranty', 'stock', 'type', 'sold'],
    showImage: true,
    fallbackEmoji: '📦',
  },
  referrals: DEFAULT_REFERRAL_CONFIG,
};

export const BUTTON_KEY_LIST: readonly ButtonKey[] = BUTTON_KEYS;
