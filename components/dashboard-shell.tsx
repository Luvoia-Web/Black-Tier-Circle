/**
 * @file components/dashboard-shell.tsx
 *
 * Client shell that composes sidebar, top bar, and main content.
 * Matches the Sweatpals/Mobbin reference: collapsible sidebar, clean topbar.
 *
 * @module Components
 */

'use client';

import { useState, type ReactNode } from 'react';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { Sidebar } from '@/components/ui/sidebar';
import { TopBar } from '@/components/ui/top-bar';
import type { UserRole } from '@/modules/identity/types';

type DashboardShellProps = {
  readonly displayName: string;
  readonly role: UserRole;
  readonly demoMode?: boolean;
  readonly children: ReactNode;
};

/**
 * Wraps dashboard pages with navigation chrome.
 *
 * @param props - Profile fields and page content
 */
export function DashboardShell({ displayName, role, demoMode = false, children }: DashboardShellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-[var(--bg-page)] text-[var(--text-1)]">
      <Sidebar
        role={role}
        displayName={displayName}
        open={open}
        collapsed={collapsed}
        onClose={() => setOpen(false)}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {demoMode ? (
          <div className="bg-[var(--amber-soft)] px-4 py-2 text-center text-sm text-[var(--amber)]">
            Demo Mode — Payments are simulated. Add real API keys to go live.
          </div>
        ) : null}
        <TopBar displayName={displayName} role={role} onMenuClick={() => setOpen(true)} />
        <main className="page-enter flex-1 p-6">{children}</main>
        <CommandPalette role={role} />
      </div>
    </div>
  );
}

export default DashboardShell;
