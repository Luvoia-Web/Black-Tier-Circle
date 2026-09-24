/**
 * @file app/api/supplier/products/[id]/pause/route.ts
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { pauseSupplierProduct } from '@/modules/supplier';

type RouteContext = { readonly params: { readonly id: string } };

export async function POST(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    await pauseSupplierProduct(asDbClient(session.admin), params.id);
    return jsonSuccess({ reviewStatus: 'paused' });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
