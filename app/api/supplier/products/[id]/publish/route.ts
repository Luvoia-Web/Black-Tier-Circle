/**
 * @file app/api/supplier/products/[id]/publish/route.ts
 *
 * Publishes a reviewed supplier product into the owner catalog.
 * Explicit prices stay on manual pricing. A markup percent prices from cost.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { usdtToMinor } from '@/lib/money';
import { publishSupplierProduct } from '@/modules/supplier';
import { z } from 'zod';

const Body = z
  .object({
    wholesalePriceUsdt: z.string().min(1).optional(),
    retailPriceUsdt: z.string().min(1).optional(),
    markupPercent: z.number().min(0).max(999.99).optional(),
    buyerCategory: z.string().trim().min(1).max(80).optional(),
  })
  .refine(
    (body) => {
      const prices = Boolean(body.wholesalePriceUsdt && body.retailPriceUsdt);
      return prices !== (body.markupPercent !== undefined);
    },
    { message: 'Provide wholesale and retail prices, or a markup percent' },
  );

type RouteContext = { readonly params: { readonly id: string } };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = Body.parse(await readJsonBody(request));
    const result = await publishSupplierProduct(asDbClient(session.admin), params.id, {
      ...(body.wholesalePriceUsdt && body.retailPriceUsdt
        ? {
            wholesalePriceMinor: usdtToMinor(body.wholesalePriceUsdt),
            retailPriceMinor: usdtToMinor(body.retailPriceUsdt),
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
