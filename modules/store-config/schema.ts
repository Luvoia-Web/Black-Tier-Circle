import { z } from 'zod';
import { BUTTON_KEYS, PRODUCT_CARD_FIELDS } from '@/modules/store-config/types';
import { isAllowedBotUrl } from '@/modules/store-config/urls';

const optionalUrl = z
  .string()
  .max(300)
  .refine((value) => value.trim().length === 0 || isAllowedBotUrl(value), 'Use an https:// or t.me link');

const requiredUrl = z
  .string()
  .min(1)
  .max(300)
  .refine((value) => isAllowedBotUrl(value), 'Use an https:// or t.me link');

export const linkSchema = z.object({
  label: z.string().trim().max(40),
  url: optionalUrl,
});

export const buttonSchema = z.object({
  enabled: z.boolean(),
  label: z.string().trim().min(1).max(32),
  emoji: z.string().trim().max(8),
  width: z.enum(['full', 'half']),
  order: z.number().int().min(0).max(50),
  action: z.enum(['section', 'url', 'support']).default('section'),
  target: z.string().trim().max(300).default(''),
});

const buttonsSchema = z.object(
  Object.fromEntries(BUTTON_KEYS.map((key) => [key, buttonSchema])) as Record<
    (typeof BUTTON_KEYS)[number],
    typeof buttonSchema
  >,
);

export const categorySettingSchema = z.object({
  emoji: z.string().trim().max(8),
  displayName: z.string().trim().max(40),
  description: z.string().trim().max(120),
  sortOrder: z.number().int().min(0).max(999),
  hidden: z.boolean(),
});

export const catalogTemplatesSchema = z.object({
  categoriesHeader: z.string().trim().min(1).max(4096),
  productListHeader: z.string().trim().min(1).max(4096),
  productFooterInstant: z.string().trim().min(1).max(4096),
  productFooterManual: z.string().trim().min(1).max(4096),
  checkoutShortfall: z.string().trim().min(1).max(4096),
  bulkDiscountHeading: z.string().trim().min(1).max(4096),
  bulkQuantityHeading: z.string().trim().min(1).max(4096),
  bulkTierLine: z.string().trim().min(1).max(4096),
  bulkSavingsLine: z.string().trim().min(1).max(4096),
});

export const customLinksSchema = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(32),
      url: requiredUrl,
      emoji: z.string().trim().max(8),
    }),
  )
  .max(3);

const minorString = z
  .string()
  .trim()
  .regex(/^\d+$/, 'Use a whole number of minor units');

export const referralConfigSchema = z.object({
  enabled: z.boolean(),
  pointsPerReferral: z.number().int().min(1).max(1000),
  pointValueMinor: minorString,
  minRedeemPoints: z.number().int().min(1).max(1_000_000),
  minQualifyingOrderMinor: minorString,
  dailyRewardCap: z.number().int().min(0).max(100_000),
  freebiesEnabled: z.boolean(),
  redeemEnabled: z.boolean(),
  templates: z.object({
    home: z.string().trim().min(1).max(4096),
    freebies: z.string().trim().min(1).max(4096),
    friendJoined: z.string().trim().min(1).max(4096),
    qualified: z.string().trim().min(1).max(4096),
    redeemed: z.string().trim().min(1).max(4096),
  }),
});

export const productCardSchema = z.object({
  fields: z
    .array(z.enum(PRODUCT_CARD_FIELDS))
    .min(1)
    .max(8)
    .refine((fields) => new Set(fields).size === fields.length, 'Each card field is listed once'),
  showImage: z.boolean(),
  fallbackEmoji: z.string().trim().min(1).max(8),
});

export const eventsSchema = z
  .object({
    enabled: z.boolean(),
    title: z.string().trim().max(120),
    body: z.string().trim().max(4096),
    link: z.string().trim().max(300),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && (value.title.length === 0 || value.body.length === 0)) {
      ctx.addIssue({ code: 'custom', message: 'An announcement needs a title and a body.' });
    }
  });

export const StoreConfigSchema = z
  .object({
    welcome: z.string().trim().min(1).max(4096),
    buttons: buttonsSchema,
    customLinks: customLinksSchema,
    links: z.object({
      channel: linkSchema,
      group: linkSchema,
      website: linkSchema,
    }),
    messages: z.object({
      supportIntro: z.string().trim().min(1).max(4096),
      checkoutHeader: z.string().trim().min(1).max(4096),
      orderProcessing: z.string().trim().min(1).max(4096),
      orderDelivered: z.string().trim().min(1).max(4096),
    }),
    catalog: z.object({
      categories: z.record(z.string().trim().min(1).max(50), categorySettingSchema),
      templates: catalogTemplatesSchema,
    }),
    productCard: productCardSchema,
    referrals: referralConfigSchema,
    events: eventsSchema,
    images: z
      .record(
        z.string().regex(/^[a-z0-9_-]{1,40}$/),
        z.string().trim().max(500).refine((value) => value.length === 0 || isAllowedBotUrl(value), 'Use an https:// image link'),
      )
      .default({}),
  })
  .strict()
  .refine((value) => JSON.stringify(value).length < 60_000, 'Config is too large');

export type StoreConfigInput = z.infer<typeof StoreConfigSchema>;
