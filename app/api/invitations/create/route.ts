/**
 * @file app/api/invitations/create/route.ts
 *
 * POST, owner only. Creates a 7-day reseller invite and records an audit row.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { getAppUrl } from '@/lib/env';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { logger } from '@/lib/logger';
import { ROUTES } from '@/lib/navigation';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { InviteCreateSchema } from '@/lib/validations/auth';
import { evaluateInvitationToken, type InvitationRow } from '@/modules/identity';

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const rate = await consumeRateLimit({ key: `invite:create:${session.user.id}`, limit: 20, fail: 'closed' });
    if (!rate.allowed) {
      throw new ValidationError('RATE_LIMITED', 'Too many invitations created. Please wait a minute.');
    }
    const body = InviteCreateSchema.parse(await readJsonBody(request));
    const email = body.email.toLowerCase();
    const admin = session.admin;
    const db = asDbClient(admin);

    const existingResult = await admin.from('invitations').select('*').eq('email', email);
    const existingRows = (existingResult.data ?? []) as InvitationRow[];
    if (existingResult.error) {
      throw new ValidationError('INVITE_LOOKUP_FAILED', existingResult.error.message, 500);
    }
    const active = existingRows.find((row) => evaluateInvitationToken(row).valid);
    if (active) {
      throw new ValidationError('INVITE_EXISTS', 'An active invitation already exists for this email');
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { data, error } = await admin
      .from('invitations')
      .insert({
        email,
        role: 'reseller',
        token,
        expires_at: expiresAt.toISOString(),
        invited_by: session.profile.id,
      } as never)
      .select('*')
      .single();
    if (error || data === null) {
      throw new ValidationError('INVITE_CREATE_FAILED', error?.message ?? 'Unable to create invitation', 500);
    }

    const created = data as { readonly id?: string };
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      action: 'reseller.invite',
      target_type: 'invitation',
      target_id: typeof created.id === 'string' ? created.id : null,
      reason: `Invited reseller ${email}`,
    });

    const inviteUrl = `${getAppUrl()}${ROUTES.invite(token)}`;
    logger.info('reseller invite created', { email, expiresAt: expiresAt.toISOString() });

    return jsonSuccess({ inviteUrl, expiresAt: expiresAt.toISOString() });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
