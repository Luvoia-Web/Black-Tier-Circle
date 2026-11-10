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

export const COMING_SOON_BUTTONS: ReadonlySet<ButtonKey> = new Set([
  'freebies',
  'referrals',
  'history',
  'redeem',
  'events',
]);

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
};

export type CatalogConfig = {
  readonly categories: Readonly<Record<string, CatalogCategorySetting>>;
  readonly templates: CatalogTemplates;
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
};

export type StoredStoreConfig = {
  readonly config: StoreConfig;
  readonly version: number;
  readonly source: 'stored' | 'default';
};
