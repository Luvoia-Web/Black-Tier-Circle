'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type PendingWaitProps = {
  readonly supportContact: string | null;
};

/**
 * Holds a new reseller until the owner sets their account to active.
 */
export function PendingWait({ supportContact }: PendingWaitProps): JSX.Element {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      setChecking(true);
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user === null) {
          router.replace(ROUTES.login);
          return;
        }
        const { data } = await supabase.from('profiles').select('status, onboarding_completed').eq('id', user.id).maybeSingle();
        const row = data as { status?: string; onboarding_completed?: boolean } | null;
        if (cancelled || row === null) {
          return;
        }
        if (row.status === 'active') {
          router.replace(row.onboarding_completed === true ? ROUTES.reseller.home : ROUTES.onboarding);
        }
        if (row.status === 'suspended') {
          router.replace(ROUTES.suspended);
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [router]);

  async function signOut(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' });
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    window.location.assign(ROUTES.login);
  }

  const contact = supportContact?.trim() ?? '';

  return (
    <div className="login-card relative z-10 max-w-md text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent-soft)]">Black Tier Circle</p>
      <h1 className="mt-3 text-2xl font-semibold text-white">Account Pending Approval</h1>
      <p className="mt-3 text-sm leading-6 text-white/70">
        The store owner will review and activate your account. You will receive access once approved.
      </p>
      <p className="mt-4 text-xs text-white/45" aria-live="polite">
        {checking ? 'Checking…' : 'We check for approval every 30 seconds.'}
      </p>
      {contact.length > 0 ? (
        <a href={contact.startsWith('http') || contact.includes('@') ? (contact.includes('@') && !contact.startsWith('mailto:') ? `mailto:${contact}` : contact) : contact} className="mt-4 inline-flex min-h-11 items-center text-sm text-[var(--accent-soft)] hover:text-white">
          Contact support
        </a>
      ) : null}
      <button type="button" onClick={() => void signOut()} className="login-google mt-6">
        Sign out
      </button>
    </div>
  );
}
