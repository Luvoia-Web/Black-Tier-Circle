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

function isUserRole(value: unknown): value is UserRole {
  return value === 'owner' || value === 'reseller' || value === 'staff';
}

function LoginForm(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
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
    <div className="flex flex-col gap-6">
      <button
        type="button"
        disabled={googleLoading || loading}
        onClick={() => void signInWithGoogle()}
        className="flex items-center justify-center gap-2 rounded-md border border-gray-700 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {googleLoading ? 'Redirecting to Google…' : 'Sign in with Google'}
      </button>
      {error ? (
        <p className="rounded-md border border-red-600/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
      ) : null}
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-gray-500">
        <span className="h-px flex-1 bg-gray-800" />
        or continue with email
        <span className="h-px flex-1 bg-gray-800" />
      </div>
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
    </div>
  );
}

export default function LoginPage(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-gray-950 p-8 text-gray-100">
      <div>
        <h1 className="text-3xl font-semibold">Black Tier Circle</h1>
        <p className="mt-2 text-sm text-gray-400">Sign in to the operations dashboard.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-gray-400">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
