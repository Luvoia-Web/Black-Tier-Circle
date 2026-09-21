/**
 * @file app/(auth)/login/page.tsx
 *
 * Email/password sign-in. Resellers join only via invite — no sign-up link.
 *
 * @module Auth
 */

'use client';

import { type FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_ROUTES, ROUTES } from '@/lib/navigation';

function LoginForm(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload: { email: string; password: string; next?: string } = { email, password };
      if (next) {
        payload.next = next;
      }
      const response = await fetch(API_ROUTES.authLogin, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: { redirectTo: string };
        error?: { code: string; message: string };
      };
      if (!json.success) {
        if (json.error?.code === 'ACCOUNT_SUSPENDED') {
          setError('This account has been suspended. Contact the owner.');
        } else {
          setError(json.error?.message ?? 'Invalid credentials');
        }
        return;
      }
      router.replace(json.data?.redirectTo ?? ROUTES.owner.home);
      router.refresh();
    } catch {
      setError('Unable to sign in. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
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
      {error ? (
        <p className="rounded-md border border-red-600/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
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
