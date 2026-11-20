/**
 * @file lib/auth/verify-user.ts
 *
 * Verifies the active session via supabase.auth.getUser() with a bounded retry
 * strictly on transient network/transport failures (AuthRetryableFetchError).
 * Invalid or expired tokens are never retried and always fail closed.
 */

import type { User } from '@supabase/supabase-js';

type AuthErrorLike = {
  readonly name?: string | undefined;
  readonly message?: string | undefined;
  readonly status?: number | undefined;
};

type SupabaseAuthLike = {
  readonly auth: {
    getUser: () => Promise<{
      readonly data: { readonly user: User | null };
      readonly error: AuthErrorLike | null;
    }>;
  };
};

function isRetryableAuthError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError') return true;
  if (typeof error.status === 'number' && (error.status >= 500 || error.status === 429)) return true;
  const msg = typeof error.message === 'string' ? error.message : '';
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|rate limit/i.test(msg);
}

/**
 * Calls supabase.auth.getUser() and retries up to twice ONLY on transient transport
 * errors so brief network blips do not log users out or cause spurious 401s.
 */
export async function getVerifiedUser(
  supabase: SupabaseAuthLike,
  options: { readonly retryDelaysMs?: readonly number[] } = {},
): Promise<{ readonly user: User | null; readonly error: AuthErrorLike | null }> {
  const delays = options.retryDelaysMs ?? [200, 500];
  let result = await supabase.auth.getUser();
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (result.data.user !== null || !isRetryableAuthError(result.error)) {
      break;
    }
    const waitMs = delays[attempt] ?? 150;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    result = await supabase.auth.getUser();
  }
  return { user: result.data.user, error: result.error };
}
