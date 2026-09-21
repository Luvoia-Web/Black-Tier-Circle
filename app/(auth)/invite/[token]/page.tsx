/**
 * @file app/(auth)/invite/[token]/page.tsx
 *
 * Reseller onboarding. Validates the invite token then creates the account.
 *
 * @module Auth
 */

'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { API_ROUTES } from '@/lib/navigation';

type InvitePageProps = {
  readonly params: { readonly token: string };
};

type ValidateState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'invalid'; readonly expired: boolean }
  | { readonly kind: 'valid'; readonly email: string }
  | { readonly kind: 'accepted' };

/**
 * Invite acceptance page. Does not redirect to the dashboard — pending accounts wait for owner approval.
 */
export default function InvitePage({ params }: InvitePageProps): JSX.Element {
  const token = params.token;
  const [state, setState] = useState<ValidateState>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function validate(): Promise<void> {
      try {
        const response = await fetch(`${API_ROUTES.invitationsValidate}?token=${encodeURIComponent(token)}`);
        const json = (await response.json()) as {
          success: boolean;
          data?: { email: string; valid: boolean; expired: boolean };
        };
        if (cancelled) {
          return;
        }
        if (!json.success || !json.data?.valid) {
          setState({ kind: 'invalid', expired: json.data?.expired === true });
          return;
        }
        setState({ kind: 'valid', email: json.data.email });
      } catch {
        if (!cancelled) {
          setState({ kind: 'invalid', expired: false });
        }
      }
    }
    void validate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state.kind !== 'valid') {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(API_ROUTES.invitationsAccept, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email: state.email,
          password,
          displayName,
        }),
      });
      const json = (await response.json()) as {
        success: boolean;
        error?: { message: string };
      };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to accept invitation');
        return;
      }
      setState({ kind: 'accepted' });
    } catch {
      setError('Unable to accept invitation. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-gray-950 p-8 text-gray-100">
      <h1 className="text-3xl font-semibold">Black Tier Circle</h1>
      {state.kind === 'loading' ? <p className="text-sm text-gray-400">Checking invite…</p> : null}
      {state.kind === 'invalid' ? (
        <div className="rounded-md border border-red-600/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {state.expired ? 'This invite link has expired.' : 'This invite link is not valid.'} Contact the owner
          for a new invite link.
        </div>
      ) : null}
      {state.kind === 'accepted' ? (
        <div className="rounded-md border border-yellow-600/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          Account created! Pending owner approval.
        </div>
      ) : null}
      {state.kind === 'valid' ? (
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          <p className="text-sm text-gray-400">Create your reseller account.</p>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Email
            <input
              type="email"
              name="email"
              readOnly
              value={state.email}
              className="rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-gray-100 opacity-80 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Display name
            <input
              type="text"
              name="displayName"
              required
              minLength={2}
              maxLength={50}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Password
            <input
              type="password"
              name="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          {error ? (
            <p className="rounded-md border border-red-600/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      ) : null}
    </main>
  );
}
