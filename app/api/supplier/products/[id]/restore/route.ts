/**
 * @file app/api/supplier/products/[id]/restore/route.ts
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { setSupplierProductReview } from '@/modules/supplier';

type RouteContext = { readonly params: { readonly id: string } };

export async function POST(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    await setSupplierProductReview(asDbClient(session.admin), params.id, 'pending_review');
    return jsonSuccess({ reviewStatus: 'pending_review' });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
