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
import { createNotification } from '@/modules/notifications';
import { updateTenantStatus } from '@/modules/tenants';
import { getOrCreateWallet } from '@/modules/wallet';

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
    if (body.status === 'active') {
      await getOrCreateWallet(asDbClient(session.admin), tenant.id);
      await createNotification(asDbClient(session.admin), {
        userId: tenant.ownerUserId,
        tenantId: tenant.id,
        type: 'reseller_activated',
        title: 'Account Activated',
        body: 'Your Black Tier Circle reseller account has been activated. Welcome!',
      });
      await createNotification(asDbClient(session.admin), {
        userId: session.user.id,
        tenantId: tenant.id,
        type: 'system',
        title: 'Reseller Activated',
        body: `${tenant.displayName} is now active.`,
        metadata: { tenantId: tenant.id },
      });
    }
    return jsonSuccess({
      id: tenant.id,
      status: tenant.status,
      updatedAt: tenant.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
