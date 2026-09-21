/**
 * @file app/api/auth/login/route.ts
 *
 * Email/password sign-in. Verifies the user with Auth and returns the
 * dashboard path for their profile role.
 *
 * @module Api
 */

import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { asDbClient } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { LoginSchema } from '@/lib/validations/auth';
import { getOrCreateProfile, resolvePostLoginPath } from '@/modules/identity';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = LoginSchema.parse(await readJsonBody(request));
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    if (error || data.user === null) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const admin = createAdminSupabaseClient();
    const displayName =
      typeof data.user.user_metadata.display_name === 'string'
        ? data.user.user_metadata.display_name
        : body.email.split('@')[0] ?? 'User';
    const appRole = data.user.app_metadata.role;
    const role = appRole === 'owner' || appRole === 'reseller' || appRole === 'staff' ? appRole : 'reseller';
    const profile = await getOrCreateProfile(asDbClient(admin), data.user.id, {
      displayName,
      role,
      status: role === 'owner' ? 'active' : 'pending',
    });
    const redirectTo = resolvePostLoginPath(profile, body.next);

    return jsonSuccess({ redirectTo, role: profile.role });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
