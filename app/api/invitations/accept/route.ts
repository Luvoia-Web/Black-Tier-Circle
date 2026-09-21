/**
 * @file app/api/invitations/accept/route.ts
 *
 * POST, public. Token is the only credential — validated strictly.
 * Creates the Auth user, reseller profile, and pending tenant.
 *
 * @module Api
 */

import { AppError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { logger } from '@/lib/logger';
import { asDbClient } from '@/lib/auth/session';
import { assertRateLimit, clientIp } from '@/lib/request-rate-limit';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { InviteAcceptSchema } from '@/lib/validations/auth';
import {
  assertInvitationAcceptable,
  getOrCreateProfile,
  type InvitationRow,
} from '@/modules/identity';
import { createTenant } from '@/modules/tenants';

export async function POST(request: Request): Promise<Response> {
  const admin = createAdminSupabaseClient();
  let createdUserId: string | null = null;
  let createdTenantId: string | null = null;

  try {
    assertRateLimit(`auth:${clientIp(request)}`, 5);
    const body = InviteAcceptSchema.parse(await readJsonBody(request));
    const { data: inviteData, error: inviteError } = await admin
      .from('invitations')
      .select('*')
      .eq('token', body.token)
      .maybeSingle();
    if (inviteError) {
      throw new ValidationError('INVITE_LOOKUP_FAILED', inviteError.message, 500);
    }

    const invitation = (inviteData as InvitationRow | null) ?? null;
    assertInvitationAcceptable(invitation, body.email);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: body.email.toLowerCase(),
      password: body.password,
      email_confirm: true,
      app_metadata: { role: 'reseller' },
      user_metadata: { display_name: body.displayName, role: 'reseller' },
    });
    if (createError || created.user === null) {
      throw new ValidationError(
        'USER_CREATE_FAILED',
        createError?.message ?? 'Unable to create account',
        createError?.message?.toLowerCase().includes('already') ? 409 : 400,
      );
    }
    createdUserId = created.user.id;

    await getOrCreateProfile(asDbClient(admin), createdUserId, {
      displayName: body.displayName,
      role: 'reseller',
      status: 'pending',
    });

    const tenant = await createTenant(asDbClient(admin), createdUserId, body.displayName);
    createdTenantId = tenant.id;

    const { error: acceptError } = await admin
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() } as never)
      .eq('id', invitation.id);
    if (acceptError) {
      throw new AppError('INVITE_ACCEPT_FAILED', acceptError.message, 500);
    }

    logger.info('reseller invitation accepted', { tenantId: tenant.id });
    return jsonSuccess({
      message: 'Account created! Pending owner approval.',
    });
  } catch (error: unknown) {
    if (createdTenantId !== null) {
      await admin.from('tenants').delete().eq('id', createdTenantId);
    }
    if (createdUserId !== null) {
      await admin.auth.admin.deleteUser(createdUserId);
    }
    return handleRouteError(error);
  }
}
