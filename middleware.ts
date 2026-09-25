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
  isOnboardingRoute,
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

type ProfileGate = {
  readonly role: UserRole | null;
  readonly status: string | null;
  readonly onboardingCompleted: boolean;
};

async function readProfileGate(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<ProfileGate> {
  const full = await supabase
    .from('profiles')
    .select('role, status, onboarding_completed')
    .eq('id', userId)
    .maybeSingle();
  if (!full.error && full.data) {
    const row = full.data as { role?: string; status?: string; onboarding_completed?: boolean };
    const role = row.role === 'owner' || row.role === 'reseller' || row.role === 'staff' ? row.role : null;
    return {
      role,
      status: typeof row.status === 'string' ? row.status : null,
      onboardingCompleted: row.onboarding_completed === true,
    };
  }
  const fallback = await supabase.from('profiles').select('role, status').eq('id', userId).maybeSingle();
  const fallbackRow = fallback.data as { role?: string; status?: string } | null;
  const role = fallbackRow?.role;
  return {
    role: role === 'owner' || role === 'reseller' || role === 'staff' ? role : null,
    status: typeof fallbackRow?.status === 'string' ? fallbackRow.status : 'active',
    onboardingCompleted: true,
  };
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

  const needsAuth = isOwnerRoute(pathname) || isResellerRoute(pathname) || isOnboardingRoute(pathname);

  if (!session) {
    if (needsAuth) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = ROUTES.login;
      loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
      return copyCookies(supabaseResponse, NextResponse.redirect(loginUrl));
    }
    return supabaseResponse;
  }

  const gate = await readProfileGate(supabase, session.user.id);
  let role = readRoleFromJwt(session) ?? gate.role;
  if (role === null) {
    role = 'reseller';
  }

  const home = dashboardHomeForRole(role);
  const holdForApproval = role === 'reseller' && gate.status === 'pending';

  if (role !== 'owner' && gate.status === 'suspended' && pathname !== ROUTES.suspended) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.suspended;
    redirectUrl.search = '';
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  if (holdForApproval) {
    if (!gate.onboardingCompleted && !isOnboardingRoute(pathname)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = ROUTES.onboarding;
      redirectUrl.search = '';
      return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
    }
    if (gate.onboardingCompleted && pathname !== ROUTES.pending) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = ROUTES.pending;
      redirectUrl.search = '';
      return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
    }
    return supabaseResponse;
  }

  if (pathname === ROUTES.pending || pathname === ROUTES.suspended) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = home;
    redirectUrl.search = '';
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  if (!gate.onboardingCompleted && !isOnboardingRoute(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.onboarding;
    redirectUrl.search = '';
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  if (gate.onboardingCompleted && isOnboardingRoute(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = home;
    redirectUrl.search = '';
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

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
