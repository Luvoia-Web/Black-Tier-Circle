/**
 * @file middleware.ts
 *
 * Next.js edge middleware for route protection and role-based redirects.
 *
 * Runs on every request before it hits a route handler or page.
 * Checks Supabase session and profile role, then redirects as needed.
 *
 * Protected route rules:
 * - /owner/* → must be authenticated + role=owner
 * - /reseller/* → must be authenticated + role=reseller
 * - /login, /, /invite, /api-docs, /api, /auth/callback → public (no auth redirect)
 *
 * @module Middleware
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  dashboardHomeForRole,
  isOwnerRoute,
  isPublicRoute,
  isResellerRoute,
  ROUTES,
} from '@/lib/navigation';
import type { UserRole } from '@/modules/identity/types';

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

function readRoleFromJwt(session: {
  user: {
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  };
}): UserRole | null {
  const appRole = session.user.app_metadata?.role;
  const userRole = session.user.user_metadata?.role;
  const candidate = typeof appRole === 'string' ? appRole : typeof userRole === 'string' ? userRole : null;
  if (candidate === 'owner' || candidate === 'reseller' || candidate === 'staff') {
    return candidate;
  }
  return null;
}

async function readRoleFromProfile(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<UserRole | null> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  if (role === 'owner' || role === 'reseller' || role === 'staff') {
    return role;
  }
  return null;
}

/**
 * Protects dashboard routes. Public paths never enter the auth redirect logic,
 * so a stale cookie cannot bounce /login ↔ dashboard.
 *
 * Uses getSession() so middleware does not make an extra Auth network round trip.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  if (isPublicRoute(pathname)) {
    return supabaseResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const needsAuth = isOwnerRoute(pathname) || isResellerRoute(pathname);

  if (!session) {
    if (needsAuth) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = ROUTES.login;
      loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
      return copyCookies(supabaseResponse, NextResponse.redirect(loginUrl));
    }
    return supabaseResponse;
  }

  let role = readRoleFromJwt(session);
  if (role === null) {
    role = await readRoleFromProfile(supabase, session.user.id);
  }
  if (role === null) {
    role = 'reseller';
  }

  const home = dashboardHomeForRole(role);

  if (isOwnerRoute(pathname) && role !== 'owner') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = home;
    redirectUrl.search = '';
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  if (isResellerRoute(pathname) && role === 'owner') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = home;
    redirectUrl.search = '';
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|auth/callback).*)'],
};
