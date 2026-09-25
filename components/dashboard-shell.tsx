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
import { usePathname } from 'next/navigation';
import { SceneBackground } from '@/components/3d/SceneBackground';
import { AssistantWidget } from '@/components/assistant/assistant-widget';
import { DashboardIdentityProvider } from '@/components/dashboard-identity';
import { PageTransition } from '@/components/motion/PageTransition';
import { ScrollProgress } from '@/components/motion/ScrollProgress';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { Sidebar } from '@/components/ui/sidebar';
import { TopBar } from '@/components/ui/top-bar';
import type { UserRole } from '@/modules/identity/types';

type DashboardShellProps = {
  readonly displayName: string;
  readonly role: UserRole;
  readonly avatarUrl?: string | null;
  readonly demoMode?: boolean;
  readonly children: ReactNode;
};

/**
 * Wraps dashboard pages with navigation chrome.
 *
 * @param props - Profile fields and page content
 */
export function DashboardShell({
  displayName,
  role,
  avatarUrl = null,
  demoMode = false,
  children,
}: DashboardShellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <DashboardIdentityProvider displayName={displayName} role={role}>
    <div className="grain relative flex min-h-screen bg-[var(--bg-page)] text-[var(--text-1)]">
      <SceneBackground />
      <Sidebar
        role={role}
        displayName={displayName}
        avatarUrl={avatarUrl}
        open={open}
        collapsed={collapsed}
        onClose={() => setOpen(false)}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
      />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {demoMode ? (
          <div className="bg-[var(--amber-soft)] px-4 py-2 text-center text-sm text-[var(--amber)]">
            Demo Mode — Payments are simulated. Add real API keys to go live.
          </div>
        ) : null}
        <TopBar displayName={displayName} role={role} avatarUrl={avatarUrl} onMenuClick={() => setOpen(true)} />
        <ScrollProgress />
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <PageTransition routeKey={pathname}>{children}</PageTransition>
        </main>
        <CommandPalette role={role} />
        <AssistantWidget role={role} displayName={displayName} />
      </div>
    </div>
    </DashboardIdentityProvider>
  );
}

export default DashboardShell;
