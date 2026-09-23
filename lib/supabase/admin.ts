/**
 * @file lib/supabase/admin.ts
 *
 * Service-role Supabase client. Server-only.
 *
 * SECURITY: Never import this file from Client Components or any bundle
 * that ships to the browser. Service role bypasses RLS, so every caller
 * must enforce tenant checks in application logic.
 *
 * @module Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { ValidationError } from '@/lib/errors';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ValidationError('MISSING_ENV', `${name} is not set`);
  }
  return value;
}

/**
 * Creates a service-role Supabase client for trusted server jobs.
 *
 * @returns Admin Supabase client
 */
export function createAdminSupabaseClient(): ReturnType<typeof createClient> {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
