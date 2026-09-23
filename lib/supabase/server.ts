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
import { NextResponse } from 'next/server';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

type CookieToSet = { name: string; value: string; options: CookieOptions };

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
      auth: {
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
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

/**
 * Route-handler client that copies auth cookies onto the JSON response.
 * `cookies().set()` alone is not always attached to `NextResponse.json()`.
 */
export function createAuthRouteClient(): {
  readonly supabase: ReturnType<typeof createServerClient>;
  readonly applyCookies: <T extends NextResponse>(response: T) => T;
} {
  const cookieStore = cookies();
  const pending: CookieToSet[] = [];

  const supabase = createServerClient(
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: {
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach((cookie) => {
            pending.push(cookie);
            try {
              cookieStore.set(cookie.name, cookie.value, cookie.options);
            } catch {
              // Response.cookies.set below is the source of truth for fetch().
            }
          });
        },
      },
    },
  );

  return {
    supabase,
    applyCookies(response) {
      pending.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
      return response;
    },
  };
}
