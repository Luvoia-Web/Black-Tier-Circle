/**
 * @file components/platform/shell.tsx
 *
 * The new dashboard frame. Mesh behind, glass rail and top bar, solid plane
 * for the page. The old shell is untouched.
 */

'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { CommandPalette } from '@/components/platform/command-palette';
import { PlatformDrawer } from '@/components/platform/drawer';
import { PlatformMesh } from '@/components/platform/mesh';
import { PlatformRail } from '@/components/platform/rail';
import { PlatformTopBar } from '@/components/platform/top-bar';
import type { UserRole } from '@/modules/identity/types';

type ShellProps = {
  readonly displayName: string;
  readonly role: UserRole;
  readonly children: ReactNode;
};

export function PlatformShell({ displayName, role, children }: ShellProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette((current) => !current);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen text-ink">
      <PlatformMesh />
      <div className="relative z-10 flex min-h-screen">
        {mobileOpen ? (
          <button type="button" aria-label="Close areas" className="fixed inset-0 z-20 bg-[color-mix(in_srgb,var(--base)_55%,transparent)] md:hidden" onClick={() => setMobileOpen(false)} />
        ) : null}
        <PlatformRail collapsed={collapsed} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <PlatformTopBar
            displayName={displayName}
            role={role}
            collapsed={collapsed}
            onOpenRail={() => setMobileOpen(true)}
            onToggleCollapsed={() => setCollapsed((current) => !current)}
            onOpenPalette={() => setPalette(true)}
          />
          <main className="min-w-0 flex-1 overflow-x-hidden bg-plane px-4 py-5 md:px-6">{children}</main>
        </div>
      </div>
      <Suspense fallback={null}>
        <PlatformDrawer />
      </Suspense>
      <CommandPalette role={role} open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
