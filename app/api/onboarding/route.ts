/**
 * @file app/api/onboarding/route.ts
 *
 * Completes first-run setup: profile name, optional store fields, and the
 * onboarding flag. Reseller store copy is written to tenant_settings.
 *
 * @module Api
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AppError, NotFoundError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { dashboardHomeForRole } from '@/lib/navigation';
import { sanitizeInput } from '@/lib/sanitize';
import { completeOnboarding } from '@/modules/identity';
import { getTenantSettings, updateTenantSettings } from '@/modules/tenant-settings';
import { createTenant, getTenantByUserId, updateTenantDisplayName, updateTenantStatus } from '@/modules/tenants';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const OnboardingSchema = z.object({
  displayName: z.string().trim().min(2, 'Enter your name').max(80),
  storeName: z.string().trim().max(80).optional(),
  supportContact: z.string().trim().max(120).optional(),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: 'Accept the terms to continue' }) }),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const body = OnboardingSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const storeName = body.storeName ? sanitizeInput(body.storeName) : '';
    const supportContact = body.supportContact ? sanitizeInput(body.supportContact) : '';

    if (session.profile.role === 'reseller') {
      let tenantId: string;
      try {
        const tenant = await getTenantByUserId(db, session.user.id);
        tenantId = tenant.id;
      } catch (error: unknown) {
        if (!(error instanceof NotFoundError)) {
          throw error;
        }
        const created = await createTenant(db, session.user.id, storeName || session.profile.displayName);
        await updateTenantStatus(db, created.id, 'active');
        tenantId = created.id;
      }
      if (storeName.length >= 2) {
        await updateTenantDisplayName(db, tenantId, storeName);
      }
      await getTenantSettings(db, tenantId);
      await updateTenantSettings(db, tenantId, {
        ...(storeName.length > 0 ? { storeName } : {}),
        ...(supportContact.length > 0 ? { supportContact } : {}),
      });
    }

    const profile = await completeOnboarding(db, session.user.id, {
      displayName: sanitizeInput(body.displayName),
      storeName: storeName.length > 0 ? storeName : null,
      supportContact: supportContact.length > 0 ? supportContact : null,
    });

    return jsonSuccess({ destination: dashboardHomeForRole(profile.role) });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return handleRouteError(error);
    }
    return handleRouteError(error);
  }
}
