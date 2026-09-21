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

// Static process.env.* access is required so Next.js inlines NEXT_PUBLIC_ values
// into the browser bundle. Dynamic process.env[name] is always undefined client-side.
function requirePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new ValidationError('MISSING_ENV', 'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  }
  return { url, anonKey };
}

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

/**
 * Returns the shared browser Supabase client bound to the public anon key.
 *
 * @returns Typed Supabase browser client
 */
export function createBrowserSupabaseClient(): ReturnType<typeof createBrowserClient> {
  if (browserClient) {
    return browserClient;
  }
  const { url, anonKey } = requirePublicEnv();
  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
