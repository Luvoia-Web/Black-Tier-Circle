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
import { ThemeToggle } from '@/components/ui/ThemeToggle';

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
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--bg-page)] p-6">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="btc-card w-full max-w-[400px] p-8">
        <p className="text-lg font-semibold">◆ Black Tier Circle</p>
        <h1 className="mt-2 text-base font-semibold">You&apos;ve been invited to Black Tier Circle</h1>
        {state.kind === 'loading' ? <p className="mt-4 text-sm text-[var(--text-2)]">Checking invite…</p> : null}
        {state.kind === 'invalid' ? (
          <div className="mt-4 rounded-[var(--r-md)] border border-[var(--red)]/20 bg-[var(--red-soft)] px-4 py-3 text-sm text-[var(--red)]">
            {state.expired ? 'This invite link has expired.' : 'This invite link is not valid.'} Contact the owner
            for a new invite link.
          </div>
        ) : null}
        {state.kind === 'accepted' ? (
          <div className="mt-4 rounded-[var(--r-md)] border border-[var(--amber)]/20 bg-[var(--amber-soft)] px-4 py-3 text-sm text-[var(--amber)]">
            Account created successfully. You can now log in.
          </div>
        ) : null}
        {state.kind === 'valid' ? (
          <form onSubmit={(event) => void onSubmit(event)} className="mt-5 flex flex-col gap-4">
            <p className="text-sm text-[var(--text-2)]">Create your reseller account.</p>
            <label className="flex flex-col gap-1 text-sm text-[var(--text-2)]">
              Email
              <input type="email" name="email" readOnly value={state.email} className="btc-input opacity-80" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-[var(--text-2)]">
              Display name
              <input
                type="text"
                name="displayName"
                required
                minLength={2}
                maxLength={50}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="btc-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-[var(--text-2)]">
              Password
              <input
                type="password"
                name="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="btc-input"
              />
            </label>
            {error ? (
              <p className="rounded-[var(--r-md)] border border-[var(--red)]/20 bg-[var(--red-soft)] px-3 py-2 text-sm text-[var(--red)]">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={loading} className="btc-btn-primary">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
