/**
 * @file lib/validations/catalog.ts
 *
 * Zod schemas for product catalog and reseller listing APIs.
 * Prices arrive as numeric strings because JSON cannot represent bigint.
 *
 * @module Validations
 */

import { z } from 'zod';

const DELIVERY_TYPES = ['file_reusable', 'inventory_unit', 'manual', 'supplier_api'] as const;
const PRODUCT_STATUSES = ['draft', 'published', 'paused', 'archived'] as const;

const skuSchema = z
  .string()
  .min(3)
  .max(50)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9-]+$/.test(value), {
    message: 'SKU must be uppercase alphanumeric characters and hyphens only',
  });

const minorPriceString = z
  .string()
  .regex(/^\d+$/, 'Price must be a numeric string in USDT minor units')
  .transform((value) => BigInt(value));

export const CreateProductSchema = z
  .object({
    sku: skuSchema,
    title: z.string().min(2).max(100),
    description: z.string().max(2000).optional(),
    category: z.string().max(50).optional(),
    deliveryType: z.enum(DELIVERY_TYPES),
    wholesalePriceStr: minorPriceString,
    retailPriceStr: minorPriceString,
    stockUnlimited: z.boolean().default(true),
    stockCount: z.number().int().positive().optional(),
    resellerEligible: z.boolean().default(true),
    maxPurchaseQty: z.number().int().min(1).max(100).default(1),
    estimatedDeliveryMinutes: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.wholesalePriceStr <= 0n) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Wholesale price must be greater than 0',
        path: ['wholesalePriceStr'],
      });
    }
    if (value.wholesalePriceStr > value.retailPriceStr) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Wholesale price cannot exceed retail price',
        path: ['retailPriceStr'],
      });
    }
    if (value.stockUnlimited === false && value.stockCount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Stock count is required when stock is limited',
        path: ['stockCount'],
      });
    }
  });

export const UpdateProductSchema = z
  .object({
    title: z.string().min(2).max(100).optional(),
    description: z.string().max(2000).nullable().optional(),
    category: z.string().max(50).nullable().optional(),
    deliveryType: z.enum(DELIVERY_TYPES).optional(),
    wholesalePriceStr: minorPriceString.optional(),
    retailPriceStr: minorPriceString.optional(),
    stockUnlimited: z.boolean().optional(),
    stockCount: z.number().int().positive().nullable().optional(),
    resellerEligible: z.boolean().optional(),
    maxPurchaseQty: z.number().int().min(1).max(100).optional(),
    estimatedDeliveryMinutes: z.number().int().positive().nullable().optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.wholesalePriceStr !== undefined &&
      value.retailPriceStr !== undefined &&
      value.wholesalePriceStr > value.retailPriceStr
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Wholesale price cannot exceed retail price',
        path: ['retailPriceStr'],
      });
    }
    if (value.wholesalePriceStr !== undefined && value.wholesalePriceStr <= 0n) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Wholesale price must be greater than 0',
        path: ['wholesalePriceStr'],
      });
    }
  });

export const UpdateProductStatusSchema = z.object({
  status: z.enum(['published', 'paused', 'archived']),
});

export const CreateListingSchema = z.object({
  productId: z.string().uuid().optional(),
  retailPriceStr: z
    .string()
    .regex(/^\d+$/, 'Price must be a numeric string in USDT minor units')
    .optional(),
  retailPriceMinor: z
    .string()
    .regex(/^\d+$/, 'Price must be a numeric string in USDT minor units')
    .optional(),
}).superRefine((value, ctx) => {
  if (value.retailPriceStr === undefined && value.retailPriceMinor === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'retailPriceStr is required',
      path: ['retailPriceStr'],
    });
  }
});

export const UpdateListingSchema = z.object({
  retailPriceStr: z
    .string()
    .regex(/^\d+$/, 'Price must be a numeric string in USDT minor units')
    .optional(),
  retailPriceMinor: z
    .string()
    .regex(/^\d+$/, 'Price must be a numeric string in USDT minor units')
    .optional(),
  isVisible: z.boolean().optional(),
});

export type CreateProductBody = z.infer<typeof CreateProductSchema>;
export type UpdateProductBody = z.infer<typeof UpdateProductSchema>;
export type CreateListingBody = z.infer<typeof CreateListingSchema>;
export type UpdateListingBody = z.infer<typeof UpdateListingSchema>;
