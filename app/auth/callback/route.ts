/**
 * @file app/auth/callback/route.ts
 *
 * Completes Google OAuth: exchanges the auth code for a session cookie,
 * then sends the user to the dashboard that matches their profile role.
 *
 * @module Auth
 */

import { NextResponse } from 'next/server';
import { asDbClient } from '@/lib/auth/session';
import { ROUTES, dashboardHomeForRole } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createAuthRouteClient } from '@/lib/supabase/server';
import { getOrCreateProfile, type UserRole } from '@/modules/identity';
import { createTenant } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

function requestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https';
    return `${proto}://${forwardedHost.split(',')[0]?.trim() ?? forwardedHost}`;
  }
  return requestUrl.origin;
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const origin = requestOrigin(request);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}${ROUTES.login}?error=no_code`);
  }

  const { supabase, applyCookies } = createAuthRouteClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(`${origin}${ROUTES.login}?error=auth_failed`);
  }

  const redirectWithSession = (path: string): NextResponse =>
    applyCookies(NextResponse.redirect(`${origin}${path}`));

  const userId = data.session.user.id;
  const loaded = await supabase
    .from('profiles')
    .select('role, status, onboarding_completed')
    .eq('id', userId)
    .maybeSingle();

  let row = loaded.data as { role?: unknown; status?: unknown; onboarding_completed?: boolean } | null;
  if (loaded.error) {
    const fallback = await supabase.from('profiles').select('role, status').eq('id', userId).maybeSingle();
    row = fallback.data as { role?: unknown; status?: unknown } | null;
    if (row) {
      row = { ...row, onboarding_completed: true };
    }
  }

  if (!row) {
    const metadata = data.session.user.user_metadata ?? {};
    const fromGoogle =
      (typeof metadata.full_name === 'string' && metadata.full_name) ||
      (typeof metadata.name === 'string' && metadata.name) ||
      'New Reseller';
    try {
      const admin = createAdminSupabaseClient();
      const db = asDbClient(admin);
      const created = await getOrCreateProfile(db, userId, {
        displayName: fromGoogle.slice(0, 80),
        role: 'owner',
        status: 'active',
      });
      await createTenant(db, userId, created.displayName);
      return redirectWithSession(ROUTES.onboarding);
    } catch {
      return redirectWithSession(`${ROUTES.login}?error=no_profile`);
    }
  }

  if (row.status === 'suspended') {
    return redirectWithSession(`${ROUTES.login}?error=suspended`);
  }

  const role: UserRole | null = row.role === 'owner' || row.role === 'reseller' || row.role === 'staff' ? row.role : null;
  if (role === null) {
    return redirectWithSession(`${ROUTES.login}?error=unknown_role`);
  }
  if (row.onboarding_completed !== true) {
    return redirectWithSession(ROUTES.onboarding);
  }
  return redirectWithSession(dashboardHomeForRole(role));
}
