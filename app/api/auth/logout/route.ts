/**
 * @file app/api/auth/logout/route.ts
 *
 * Clears the Supabase session cookies and returns to login.
 *
 * @module Api
 */

import { handleRouteError, jsonSuccess } from '@/lib/http';
import { ROUTES } from '@/lib/navigation';
import { assertRateLimit, clientIp } from '@/lib/request-rate-limit';
import { createAuthRouteClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    assertRateLimit(`auth:${clientIp(request)}`, 5);
    const { supabase, applyCookies } = createAuthRouteClient();
    await supabase.auth.signOut();
    return applyCookies(jsonSuccess({ redirectTo: ROUTES.login }));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
