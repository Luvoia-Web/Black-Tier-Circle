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
import { limitApiRequest } from '@/lib/api-rate-limit';
import { getVerifiedUser } from '@/lib/auth/verify-user';
import { legacyDestination } from '@/lib/legacy-redirects';
import {
  dashboardHomeForRole,
  isOnboardingRoute,
  isOwnerRoute,
  isPlatformRoute,
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

function readRoleFromUser(user: {
  app_metadata?: Record<string, unknown>;
}): UserRole | null {
  // SECURITY: only app_metadata is trusted. user_metadata can be edited by the
  // signed-in user from the browser, so it must never decide a role.
  const appRole = user.app_metadata?.role;
  if (appRole === 'owner' || appRole === 'reseller' || appRole === 'staff') {
    return appRole;
  }
  return null;
}

type ProfileGate = {
  readonly role: UserRole;
  readonly status: string;
  readonly onboardingCompleted: boolean;
};

/**
 * Reads the database profile gate. Fails CLOSED (redirects to /login) whenever
 * the profile cannot be read or when role or status is missing.
 */
export async function readProfileGate(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  request: NextRequest,
): Promise<ProfileGate | NextResponse> {
  const full = await supabase
    .from('profiles')
    .select('role, status, onboarding_completed')
    .eq('id', userId)
    .maybeSingle();
  if (full.error || !full.data) {
    return NextResponse.redirect(new URL(ROUTES.login, request.url));
  }
  const row = full.data as { role?: unknown; status?: unknown; onboarding_completed?: unknown };
  const role =
    row.role === 'owner' || row.role === 'reseller' || row.role === 'staff' ? row.role : null;
  const status = typeof row.status === 'string' && row.status.trim().length > 0 ? row.status : null;
  if (!role || !status) {
    return NextResponse.redirect(new URL(ROUTES.login, request.url));
  }
  return {
    role,
    status,
    onboardingCompleted: row.onboarding_completed === true,
  };
}

/**
 * Protects dashboard routes. Public paths never enter the auth redirect logic,
 * so a stale cookie cannot bounce /login ↔ dashboard.
 *
 * Uses getUser() to verify the JWT with Supabase Auth on every protected route.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const limited = await limitApiRequest(request);
  if (limited) return limited;

  const pathname = request.nextUrl.pathname;
  const moved = legacyDestination(pathname);
  if (moved) {
    const url = request.nextUrl.clone();
    const queryAt = moved.indexOf('?');
    url.pathname = queryAt === -1 ? moved : moved.slice(0, queryAt);
    url.search = queryAt === -1 ? '' : moved.slice(queryAt);
    return NextResponse.redirect(url, 308);
  }

  let supabaseResponse = NextResponse.next({ request });

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

  const { user, error: userError } = await getVerifiedUser(supabase);

  const needsAuth =
    isOwnerRoute(pathname) || isResellerRoute(pathname) || isOnboardingRoute(pathname) || isPlatformRoute(pathname);

  if (userError || !user) {
    if (needsAuth) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = ROUTES.login;
      loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
      return copyCookies(supabaseResponse, NextResponse.redirect(loginUrl));
    }
    return supabaseResponse;
  }

  const gate = await readProfileGate(supabase, user.id, request);
  if (gate instanceof NextResponse) {
    return copyCookies(supabaseResponse, gate);
  }
  // SECURITY: the database profile is the source of truth for role.
  const role = gate.role ?? readRoleFromUser(user);
  if (role === null) {
    return copyCookies(supabaseResponse, NextResponse.redirect(new URL(ROUTES.login, request.url)));
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

  if (role !== 'owner' && gate.status === 'suspended') {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|auth/callback).*)'],
};
