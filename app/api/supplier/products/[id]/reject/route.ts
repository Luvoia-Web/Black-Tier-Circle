/**
 * @file app/api/supplier/products/[id]/reject/route.ts
 *
 * Marks a supplier product rejected. Restore sends it back to review.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { setSupplierProductReview } from '@/modules/supplier';

type RouteContext = { readonly params: { readonly id: string } };

export async function POST(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    await setSupplierProductReview(asDbClient(session.admin), params.id, 'rejected');
    return jsonSuccess({ reviewStatus: 'rejected' });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
