/**
 * @file app/api/resellers/[tenantId]/status/route.ts
 *
 * PATCH, owner only. Activates or suspends a reseller tenant with audit reason.
 *
 * @module Api
 */

import { z } from 'zod';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { sanitizeInput } from '@/lib/sanitize';
import { UpdateTenantStatusSchema } from '@/lib/validations/auth';
import { createNotification } from '@/modules/notifications';
import { getTenantById, updateTenantStatus } from '@/modules/tenants';
import { getOrCreateWallet } from '@/modules/wallet';

type RouteContext = {
  readonly params: { readonly tenantId: string };
};

const TenantIdSchema = z.string().uuid();

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const rate = await consumeRateLimit({ key: `reseller:status:${session.user.id}`, limit: 30, fail: 'closed' });
    if (!rate.allowed) {
      throw new ValidationError('RATE_LIMITED', 'Too many reseller status changes. Try again in a minute.');
    }
    const tenantId = TenantIdSchema.parse(context.params.tenantId);
    const body = UpdateTenantStatusSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const before = await getTenantById(db, tenantId);
    const tenant = await updateTenantStatus(db, tenantId, body.status);
    const cleanReason = sanitizeInput(body.reason ?? '').slice(0, 300);

    let action = 'reseller.suspend';
    let defaultReason = 'Suspended reseller store';
    if (body.status === 'active') {
      if (before.status === 'pending') {
        action = 'reseller.approve';
        defaultReason = 'Approved reseller application';
      } else {
        action = 'reseller.unblock';
        defaultReason = 'Reactivated reseller store';
      }
    }

    await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: tenant.id,
      action,
      target_type: 'tenant',
      target_id: tenant.id,
      reason: cleanReason || defaultReason,
      after_val: { previousStatus: before.status, status: tenant.status },
    });

    if (body.status === 'active') {
      await getOrCreateWallet(db, tenant.id);
      await createNotification(db, {
        userId: tenant.ownerUserId,
        tenantId: tenant.id,
        type: 'reseller_activated',
        title: 'Account Activated',
        body: 'Your Black Tier Circle reseller account has been activated. Welcome!',
      });
      await createNotification(db, {
        userId: session.user.id,
        tenantId: tenant.id,
        type: 'system',
        title: 'Reseller Activated',
        body: `${tenant.displayName} is now active.`,
        metadata: { tenantId: tenant.id },
      });
    } else if (body.status === 'suspended' && before.status === 'pending') {
      await createNotification(db, {
        userId: tenant.ownerUserId,
        tenantId: tenant.id,
        type: 'reseller_suspended',
        title: 'Application not approved',
        body: cleanReason
          ? `Your reseller application was not approved: ${cleanReason}`
          : 'Your reseller application was not approved.',
      });
    } else if (body.status === 'suspended') {
      await createNotification(db, {
        userId: tenant.ownerUserId,
        tenantId: tenant.id,
        type: 'reseller_suspended',
        title: 'Account suspended',
        body: cleanReason
          ? `Your reseller store was suspended: ${cleanReason}`
          : 'Your reseller store has been suspended by the platform owner.',
      });
    }

    return jsonSuccess({
      id: tenant.id,
      status: tenant.status,
      reason: cleanReason || defaultReason,
      updatedAt: tenant.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
