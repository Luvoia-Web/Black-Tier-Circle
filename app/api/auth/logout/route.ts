/**
 * @file app/api/auth/logout/route.ts
 *
 * Clears the Supabase session cookies and returns to login.
 *
 * @module Api
 */

import { handleRouteError, jsonSuccess } from '@/lib/http';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ROUTES } from '@/lib/navigation';

export async function POST(): Promise<Response> {
  try {
    const supabase = createServerSupabaseClient();
    await supabase.auth.signOut();
    return jsonSuccess({ redirectTo: ROUTES.login });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
