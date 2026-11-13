export const BUTTON_KEYS = [
  'shop',
  'freebies',
  'deposit',
  'profile',
  'support',
  'referrals',
  'history',
  'redeem',
  'events',
  'terms',
  'reseller_signup',
  'api',
] as const;

export type ButtonKey = (typeof BUTTON_KEYS)[number];

export const COMING_SOON_BUTTONS: ReadonlySet<ButtonKey> = new Set(['history', 'redeem', 'events']);

export type ReferralTemplates = {
  readonly home: string;
  readonly freebies: string;
  readonly friendJoined: string;
  readonly qualified: string;
  readonly redeemed: string;
};

export type ReferralConfig = {
  readonly enabled: boolean;
  readonly pointsPerReferral: number;
  readonly pointValueMinor: string;
  readonly minRedeemPoints: number;
  readonly minQualifyingOrderMinor: string;
  readonly dailyRewardCap: number;
  readonly freebiesEnabled: boolean;
  readonly redeemEnabled: boolean;
  readonly templates: ReferralTemplates;
};

export const WELCOME_PLACEHOLDERS = ['name', 'store', 'balance', 'channel', 'group', 'website'] as const;

export const MESSAGE_PLACEHOLDERS = [
  ...WELCOME_PLACEHOLDERS,
  'product',
  'quantity',
  'total',
  'order',
  'content',
] as const;

export type ButtonWidth = 'full' | 'half';

export type StoreButton = {
  readonly enabled: boolean;
  readonly label: string;
  readonly emoji: string;
  readonly width: ButtonWidth;
  readonly order: number;
};

export type StoreLink = {
  readonly label: string;
  readonly url: string;
};

export type CustomLink = {
  readonly label: string;
  readonly url: string;
  readonly emoji: string;
};

export type StoreMessages = {
  readonly supportIntro: string;
  readonly checkoutHeader: string;
  readonly orderProcessing: string;
  readonly orderDelivered: string;
};

export type CatalogCategorySetting = {
  readonly emoji: string;
  readonly displayName: string;
  readonly description: string;
  readonly sortOrder: number;
  readonly hidden: boolean;
};

export type CatalogTemplates = {
  readonly categoriesHeader: string;
  readonly productListHeader: string;
  readonly productFooterInstant: string;
  readonly productFooterManual: string;
  readonly checkoutShortfall: string;
  readonly bulkDiscountHeading: string;
  readonly bulkQuantityHeading: string;
  readonly bulkTierLine: string;
  readonly bulkSavingsLine: string;
};

export type CatalogConfig = {
  readonly categories: Readonly<Record<string, CatalogCategorySetting>>;
  readonly templates: CatalogTemplates;
};

export const PRODUCT_CARD_FIELDS = ['image', 'name', 'price', 'duration', 'warranty', 'stock', 'sold', 'type'] as const;

export type ProductCardField = (typeof PRODUCT_CARD_FIELDS)[number];

export type ProductCardConfig = {
  readonly fields: readonly ProductCardField[];
  readonly showImage: boolean;
  readonly fallbackEmoji: string;
};

export type StoreConfig = {
  readonly welcome: string;
  readonly buttons: Record<ButtonKey, StoreButton>;
  readonly customLinks: readonly CustomLink[];
  readonly links: {
    readonly channel: StoreLink;
    readonly group: StoreLink;
    readonly website: StoreLink;
  };
  readonly messages: StoreMessages;
  readonly catalog: CatalogConfig;
  readonly productCard: ProductCardConfig;
  readonly referrals: ReferralConfig;
};

export type StoredStoreConfig = {
  readonly config: StoreConfig;
  readonly version: number;
  readonly source: 'stored' | 'default';
};
