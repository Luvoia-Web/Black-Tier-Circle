/**
 * @file app/api/supplier/products/[id]/price/route.ts
 *
 * Updates wholesale and retail prices for a supplier product.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { usdtToMinor } from '@/lib/money';
import { updateSupplierProductPrices } from '@/modules/supplier';
import { z } from 'zod';

const Body = z.object({
  wholesalePriceUsdt: z.string().min(1).optional(),
  retailPriceUsdt: z.string().min(1).optional(),
});

type RouteContext = { readonly params: { readonly id: string } };

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = Body.parse(await readJsonBody(request));
    await updateSupplierProductPrices(asDbClient(session.admin), params.id, {
      ...(body.wholesalePriceUsdt ? { wholesalePriceMinor: usdtToMinor(body.wholesalePriceUsdt) } : {}),
      ...(body.retailPriceUsdt ? { retailPriceMinor: usdtToMinor(body.retailPriceUsdt) } : {}),
    });
    return jsonSuccess({ updated: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
