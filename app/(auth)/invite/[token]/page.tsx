/**
 * @file app/(auth)/invite/[token]/page.tsx
 *
 * Reseller onboarding. Validates the invite token then creates the account.
 *
 * @module Auth
 */

'use client';

import { type FormEvent, useState } from 'react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES } from '@/lib/navigation';

type InvitePageProps = {
  readonly params: { readonly token: string };
};

type InviteCheck = { readonly email: string; readonly valid: boolean; readonly expired: boolean };

/**
 * Invite acceptance page. Does not redirect to the dashboard — pending accounts wait for owner approval.
 */
export default function InvitePage({ params }: InvitePageProps): JSX.Element {
  const token = params.token;
  const [accepted, setAccepted] = useState(false);
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const checked = useData<InviteCheck>(accepted ? null : `${API_ROUTES.invitationsValidate}?token=${encodeURIComponent(token)}`);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!checked.data?.valid) {
      return;
    }
    setError(null);
    setLoading(true);
    const result = await runAction(API_ROUTES.invitationsAccept, {
      method: 'POST',
      body: { token, email: checked.data.email, password, displayName },
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setAccepted(true);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--bg-page)] p-6">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="btc-card w-full max-w-[400px] p-8">
        <p className="text-lg font-semibold">◆ Black Tier Circle</p>
        <h1 className="mt-2 text-base font-semibold">You&apos;ve been invited to Black Tier Circle</h1>
        {checked.loading ? <p className="mt-4 text-sm text-[var(--text-2)]">Checking invite…</p> : null}
        {!accepted && !checked.loading && (checked.error || !checked.data?.valid) ? (
          <div className="mt-4 rounded-[var(--r-md)] border border-[var(--red)]/20 bg-[var(--red-soft)] px-4 py-3 text-sm text-[var(--red)]">
            {checked.data?.expired ? 'This invite link has expired.' : checked.error ? checked.error.message : 'This invite link is not valid.'} Contact the owner
            for a new invite link.
          </div>
        ) : null}
        {accepted ? (
          <div className="mt-4 rounded-[var(--r-md)] border border-[var(--amber)]/20 bg-[var(--amber-soft)] px-4 py-3 text-sm text-[var(--amber)]">
            Account created! Pending owner approval.
          </div>
        ) : null}
        {!accepted && checked.data?.valid ? (
          <form onSubmit={(event) => void onSubmit(event)} className="mt-5 flex flex-col gap-4">
            <p className="text-sm text-[var(--text-2)]">Create your reseller account.</p>
            <label className="flex flex-col gap-1 text-sm text-[var(--text-2)]">
              Email
              <input type="email" name="email" readOnly value={checked.data.email} className="btc-input opacity-80" />
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
