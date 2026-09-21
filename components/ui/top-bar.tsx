/**
 * @file components/ui/top-bar.tsx
 *
 * Top navigation bar with user info and sign out.
 *
 * @module Components
 */

'use client';

import { useState } from 'react';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { UserRole } from '@/modules/identity/types';

type TopBarProps = {
  readonly displayName: string;
  readonly role: UserRole;
  readonly onMenuClick: () => void;
};

const ROLE_LABEL: Record<UserRole, string> = {
  owner: 'Owner',
  reseller: 'Reseller',
  staff: 'Staff',
};

/**
 * Renders the dashboard top bar.
 *
 * @param props - User display fields and mobile menu handler
 */
export function TopBar({ displayName, role, onMenuClick }: TopBarProps): JSX.Element {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await fetch(API_ROUTES.authLogout, { method: 'POST' });
    } catch {
      // Continue client sign-out even if the API call fails.
    }
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Session cookies may already be cleared by the API route.
    }
    window.location.assign(ROUTES.login);
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-800 bg-gray-900 px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-100 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 lg:hidden"
          aria-label="Open navigation"
        >
          Menu
        </button>
        <p className="hidden text-sm text-gray-400 sm:block">Operations</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-gray-100">{displayName}</p>
          <p className="text-xs text-indigo-400">{ROLE_LABEL[role]}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleSignOut();
          }}
          disabled={signingOut}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </header>
  );
}
