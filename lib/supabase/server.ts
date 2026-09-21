/**
 * @file lib/supabase/server.ts
 *
 * Server Supabase client that reads and writes auth cookies.
 *
 * Used from Server Components, Route Handlers, and middleware helpers.
 * Tenant identity must still be derived from the authenticated session,
 * never from a request body.
 *
 * @module Supabase
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

function requirePublicEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name];
  if (!value) {
    throw new ValidationError('MISSING_ENV', `${name} is not set`);
  }
  return value;
}

/**
 * Creates a cookie-aware Supabase server client.
 *
 * @returns Server Supabase client
 */
export function createServerSupabaseClient(): ReturnType<typeof createServerClient> {
  const cookieStore = cookies();

  return createServerClient(
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>,
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error: unknown) {
            logger.warn('supabase cookie set skipped in this context', {
              reason: error instanceof Error ? error.message : 'unknown',
            });
          }
        },
      },
    },
  );
}
