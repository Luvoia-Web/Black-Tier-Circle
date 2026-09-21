/**
 * @file app/(dashboard)/owner/resellers/invite/page.tsx
 *
 * Owner form to create a reseller invite link (email delivery is Phase 6).
 *
 * @module Dashboard
 */

'use client';

import { type FormEvent, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES } from '@/lib/navigation';

/**
 * Creates a 7-day invite and shows a copyable URL.
 */
export default function InviteResellerPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setInviteUrl(null);
    setCopied(false);
    setLoading(true);
    try {
      const response = await fetch(API_ROUTES.invitationsCreate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: { inviteUrl: string };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to create invite');
        return;
      }
      setInviteUrl(json.data.inviteUrl);
    } catch {
      setError('Unable to create invite');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink(): Promise<void> {
    if (!inviteUrl) {
      return;
    }
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
  }

  return (
    <>
      <PageHeader title="Invite reseller" description="Generate a sign-up link. Share it directly until email is wired." />
      <form onSubmit={(event) => void onSubmit(event)} className="max-w-lg space-y-4">
        <label className="flex flex-col gap-1 text-sm text-[var(--text-2)]">
          Reseller email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </label>
        {error ? (
          <p className="rounded-md border border-[var(--red)]/20 bg-[var(--red-soft)] px-3 py-2 text-sm text-[var(--red)]">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Sending…' : 'Send Invite'}
        </button>
      </form>
      {inviteUrl ? (
        <div className="mt-8 max-w-lg rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-sm text-[var(--text-2)]">Share this link with your reseller. They will use it to create their account.</p>
          <p className="mt-2 font-mono text-sm text-[var(--text-1)] break-all">{inviteUrl}</p>
          <p className="mt-2 text-xs text-[var(--amber)]">Link expires in 7 days</p>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="mt-3 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 py-1.5 text-sm text-[var(--text-1)] hover:bg-[var(--bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      ) : null}
    </>
  );
}
