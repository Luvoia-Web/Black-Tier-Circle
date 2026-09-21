/**
 * @file app/api/auth/logout/route.ts
 *
 * Clears the Supabase session cookies and returns to login.
 *
 * @module Api
 */

import { handleRouteError, jsonSuccess } from '@/lib/http';
import { createAuthRouteClient } from '@/lib/supabase/server';
import { ROUTES } from '@/lib/navigation';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  try {
    const { supabase, applyCookies } = createAuthRouteClient();
    await supabase.auth.signOut();
    return applyCookies(jsonSuccess({ redirectTo: ROUTES.login }));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
