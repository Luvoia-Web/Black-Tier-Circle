/**
 * @file app/(auth)/login/page.tsx
 *
 * Email/password sign-in via the Supabase browser client.
 * Resellers join only via invite — no sign-up link.
 *
 * @module Auth
 */

'use client';

import { type FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { dashboardHomeForRole, isSafeNextPath } from '@/lib/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { UserRole } from '@/modules/identity/types';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

function isUserRole(value: unknown): value is UserRole {
  return value === 'owner' || value === 'reseller' || value === 'staff';
}

function oauthErrorMessage(code: string | null): string | null {
  if (code === 'auth_failed') {
    return 'Sign in failed. Please try again.';
  }
  if (code === 'no_profile') {
    return 'Account not found. Contact the owner for an invite.';
  }
  if (code === 'no_code') {
    return 'Sign in was cancelled. Please try again.';
  }
  if (code === 'unknown_role') {
    return 'Unable to determine your account type. Contact support.';
  }
  return null;
}

function LoginForm(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() => oauthErrorMessage(searchParams.get('error')));
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function signInWithGoogle(): Promise<void> {
    setError(null);
    setGoogleLoading(true);
    try {
      const origin =
        (typeof window !== 'undefined' && window.location.origin) ||
        process.env.NEXT_PUBLIC_APP_URL;
      if (!origin) {
        setError('Unable to start Google sign-in. Try again.');
        setGoogleLoading(false);
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin.replace(/\/$/, '')}/auth/callback` },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch {
      setError('Unable to start Google sign-in. Try again.');
      setGoogleLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError || data.user === null) {
        setError('Invalid email or password');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError || profile === null) {
        setError('Unable to load your profile. Contact support.');
        return;
      }

      const row = profile as { role: unknown; status: unknown };
      if (row.status === 'suspended') {
        setError('This account has been suspended. Contact the owner.');
        await supabase.auth.signOut();
        return;
      }
      if (!isUserRole(row.role)) {
        setError('Unable to load your profile. Contact support.');
        return;
      }

      const destination =
        next !== null && isSafeNextPath(next, row.role) ? next : dashboardHomeForRole(row.role);
      router.push(destination);
      router.refresh();
    } catch {
      setError('Unable to sign in. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        disabled={googleLoading || loading}
        onClick={() => void signInWithGoogle()}
        className="flex items-center justify-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleMark />
        {googleLoading ? 'Redirecting to Google…' : 'Continue with Google'}
      </button>
      {error ? (
        <p className="rounded-[var(--r-md)] border border-[var(--red)]/20 bg-[var(--red-soft)] px-3 py-2 text-sm text-[var(--red)]">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-[var(--text-3)]">
        <span className="h-px flex-1 bg-[var(--border)]" />
        or
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-[var(--text-2)]">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="btc-input"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-2)]">
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="btc-input"
          />
        </label>
        <button type="submit" disabled={loading} className="btc-btn-primary">
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

function GoogleMark(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.2 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.8-6.7 7.4l6.3 5.3C38.4 37.3 44 31.7 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export default function LoginPage(): JSX.Element {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--bg-page)] p-6">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="btc-card w-full max-w-[400px] p-8">
        <div className="mb-6">
          <p className="text-lg font-semibold text-[var(--text-1)]">◆ Black Tier Circle</p>
          <p className="mt-1 text-sm text-[var(--text-2)]">Operations dashboard</p>
        </div>
        <Suspense fallback={<p className="text-sm text-[var(--text-2)]">Loading…</p>}>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-center text-xs text-[var(--text-3)]">Resellers join via invite link</p>
      </div>
    </main>
  );
}
