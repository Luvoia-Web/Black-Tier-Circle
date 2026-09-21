/**
 * @file app/api/invitations/validate/route.ts
 *
 * GET, public. Returns whether an invite token can still be accepted.
 * Does not accept or modify the invitation.
 *
 * @module Api
 */

import { handleRouteError, jsonSuccess } from '@/lib/http';
import { assertRateLimit, clientIp } from '@/lib/request-rate-limit';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { evaluateInvitationToken, type InvitationRow } from '@/modules/identity';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    assertRateLimit(`auth:${clientIp(request)}`, 5);
    const token = new URL(request.url).searchParams.get('token') ?? '';
    if (token.length === 0) {
      return jsonSuccess({ email: '', valid: false, expired: false });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from('invitations').select('*').eq('token', token).maybeSingle();
    if (error) {
      return jsonSuccess({ email: '', valid: false, expired: false });
    }
    const invitation = (data as InvitationRow | null) ?? null;
    return jsonSuccess(evaluateInvitationToken(invitation));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
