/**
 * @file app/api/resellers/[tenantId]/status/route.ts
 *
 * PATCH, owner only. Activates or suspends a reseller tenant.
 *
 * @module Api
 */

import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { UpdateTenantStatusSchema } from '@/lib/validations/auth';
import { updateTenantStatus } from '@/modules/tenants';

type RouteContext = {
  readonly params: { readonly tenantId: string };
};

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = UpdateTenantStatusSchema.parse(await readJsonBody(request));
    const tenant = await updateTenantStatus(
      asDbClient(session.admin),
      context.params.tenantId,
      body.status,
    );
    return jsonSuccess({
      id: tenant.id,
      status: tenant.status,
      updatedAt: tenant.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
