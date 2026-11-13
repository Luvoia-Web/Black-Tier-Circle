/**
 * @file app/api/supplier/products/bulk-publish/route.ts
 *
 * Publishes up to 200 supplier products from one markup.
 * One bad id is reported on its own row. The rest still publish.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { usdtToMinor } from '@/lib/money';
import { bulkPublishSupplierProducts } from '@/modules/supplier';
import type { MarkupSide } from '@/modules/supplier/markup-rules';
import { z } from 'zod';

const Body = z
  .object({
    supplierProductIds: z.array(z.string().min(1)).min(1).max(200),
    markupPercent: z.number().min(0).max(999.99).optional(),
    wholesaleMarkupKind: z.enum(['percent', 'fixed']).optional(),
    wholesaleMarkupValue: z.number().min(0).optional(),
    retailMarkupKind: z.enum(['percent', 'fixed']).optional(),
    retailMarkupValue: z.number().min(0).optional(),
    buyerCategory: z.string().trim().min(1).max(80).optional(),
  })
  .refine((body) => {
    const sides = [body.wholesaleMarkupKind, body.wholesaleMarkupValue, body.retailMarkupKind, body.retailMarkupValue];
    const anySide = sides.some((value) => value !== undefined);
    return !anySide || sides.every((value) => value !== undefined);
  }, { message: 'Set both wholesale and retail markup rules' });

function rule(kind: 'percent' | 'fixed', value: number): MarkupSide {
  if (kind === 'fixed') {
    return { kind, percent: null, minor: usdtToMinor(String(value)) };
  }
  return { kind, percent: Math.min(999.99, value), minor: null };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = Body.parse(await readJsonBody(request));
    const result = await bulkPublishSupplierProducts(asDbClient(session.admin), {
      supplierProductIds: body.supplierProductIds,
      ...(body.wholesaleMarkupKind !== undefined &&
      body.wholesaleMarkupValue !== undefined &&
      body.retailMarkupKind !== undefined &&
      body.retailMarkupValue !== undefined
        ? {
            wholesaleRule: rule(body.wholesaleMarkupKind, body.wholesaleMarkupValue),
            retailRule: rule(body.retailMarkupKind, body.retailMarkupValue),
          }
        : {}),
      ...(body.markupPercent !== undefined ? { markupPercent: body.markupPercent } : {}),
      ...(body.buyerCategory ? { buyerCategory: body.buyerCategory } : {}),
    });
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
