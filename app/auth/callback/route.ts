/**
 * @file app/auth/callback/route.ts
 *
 * Completes Google OAuth: exchanges the auth code for a session cookie,
 * then sends the user to the dashboard that matches their profile role.
 *
 * @module Auth
 */

import { NextResponse } from 'next/server';
import { dashboardHomeForRole, ROUTES } from '@/lib/navigation';
import { createAuthRouteClient } from '@/lib/supabase/server';
import type { UserRole } from '@/modules/identity/types';

export const dynamic = 'force-dynamic';

function asRole(value: unknown): UserRole | null {
  if (value === 'owner' || value === 'reseller' || value === 'staff') {
    return value;
  }
  return null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;
  const loginUrl = `${origin}${ROUTES.login}`;

  if (code === null || code.length === 0) {
    return NextResponse.redirect(loginUrl);
  }

  const { supabase, applyCookies } = createAuthRouteClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(loginUrl);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = asRole((profile as { role?: unknown } | null)?.role);
  const destination = `${origin}${role === null ? ROUTES.reseller.home : dashboardHomeForRole(role)}`;

  return applyCookies(NextResponse.redirect(destination));
}
