/**
 * @file app/api/supplier/products/[id]/publish/route.ts
 *
 * Publishes a reviewed supplier product into the owner catalog.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { usdtToMinor } from '@/lib/money';
import { publishSupplierProduct } from '@/modules/supplier';
import { z } from 'zod';

const Body = z.object({
  wholesalePriceUsdt: z.string().min(1),
  retailPriceUsdt: z.string().min(1),
});

type RouteContext = { readonly params: { readonly id: string } };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = Body.parse(await readJsonBody(request));
    const result = await publishSupplierProduct(asDbClient(session.admin), params.id, {
      wholesalePriceMinor: usdtToMinor(body.wholesalePriceUsdt),
      retailPriceMinor: usdtToMinor(body.retailPriceUsdt),
    });
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
