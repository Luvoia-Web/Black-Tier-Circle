/**
 * @file lib/supabase/client.ts
 *
 * Browser Supabase client using the public anon key.
 *
 * This client is safe for React Client Components. It never receives
 * the service role key. Session cookies are managed by @supabase/ssr.
 *
 * @module Supabase
 */

import { createBrowserClient } from '@supabase/ssr';
import { ValidationError } from '@/lib/errors';

function requirePublicEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name];
  if (!value) {
    throw new ValidationError('MISSING_ENV', `${name} is not set`);
  }
  return value;
}

/**
 * Creates a browser Supabase client bound to the current origin.
 *
 * @returns Typed Supabase browser client
 */
export function createBrowserSupabaseClient(): ReturnType<typeof createBrowserClient> {
  return createBrowserClient(
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  );
}
