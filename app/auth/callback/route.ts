/**
 * @file app/auth/callback/route.ts
 *
 * Completes Google OAuth: exchanges the auth code for a session cookie,
 * then sends the user to the dashboard that matches their profile role.
 *
 * @module Auth
 */

import { NextResponse } from 'next/server';
import { ROUTES } from '@/lib/navigation';
import { createAuthRouteClient } from '@/lib/supabase/server';

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', data.session.user.id)
    .single();

  if (!profile) {
    return redirectWithSession(`${ROUTES.login}?error=no_profile`);
  }

  const row = profile as { role: unknown; status: unknown };
  if (row.role === 'owner') {
    return redirectWithSession(ROUTES.owner.home);
  }
  if (row.role === 'reseller') {
    return redirectWithSession(ROUTES.reseller.home);
  }

  return redirectWithSession(`${ROUTES.login}?error=unknown_role`);
}
