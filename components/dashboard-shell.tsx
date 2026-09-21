/**
 * @file components/dashboard-shell.tsx
 *
 * Client shell that composes sidebar, top bar, and main content.
 *
 * @module Components
 */

'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar } from '@/components/ui/sidebar';
import { TopBar } from '@/components/ui/top-bar';
import type { UserRole } from '@/modules/identity/types';

type DashboardShellProps = {
  readonly displayName: string;
  readonly role: UserRole;
  readonly children: ReactNode;
};

/**
 * Wraps dashboard pages with navigation chrome.
 *
 * @param props - Profile fields and page content
 */
export function DashboardShell({ displayName, role, children }: DashboardShellProps): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      <Sidebar role={role} open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar displayName={displayName} role={role} onMenuClick={() => setOpen(true)} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
