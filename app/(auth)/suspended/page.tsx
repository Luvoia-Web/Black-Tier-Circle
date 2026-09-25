'use client';

import { ROUTES } from '@/lib/navigation';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function SuspendedPage(): JSX.Element {
  async function signOut(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' });
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    window.location.assign(ROUTES.login);
  }

  return (
    <main className="login-stage">
      <div className="login-grid" aria-hidden="true" />
      <div className="login-orb login-orb-1" aria-hidden="true" />
      <div className="login-orb login-orb-2" aria-hidden="true" />
      <div className="login-orb login-orb-3" aria-hidden="true" />
      <div className="absolute right-6 top-6 z-10">
        <ThemeToggle />
      </div>
      <div className="login-card relative z-10 max-w-md text-center">
        <h1 className="text-2xl font-semibold text-white">Account suspended</h1>
        <p className="mt-3 text-sm leading-6 text-white/70">
          This reseller account is not approved. Contact the store owner if you think this is a mistake.
        </p>
        <button type="button" onClick={() => void signOut()} className="login-google mt-6">
          Sign out
        </button>
      </div>
    </main>
  );
}
