'use client';

/**
 * Dashboard frame. The mesh stays behind a floating sidebar and a floating top bar.
 */

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { AssistantWidget } from '@/components/assistant/assistant-widget';
import { CommandPalette } from '@/components/platform/command-palette';
import { DrawerBodyContext } from '@/components/platform/drawer-body';
import { PlatformDrawer } from '@/components/platform/drawer';
import { PlatformMesh } from '@/components/platform/mesh';
import { PlatformSidebar, useNavCounts } from '@/components/platform/sidebar';
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
  const [drawerBody, setDrawerBody] = useState<ReactNode>(null);
  const counts = useNavCounts();

  useEffect(() => {
    document.documentElement.dataset.role = role;
  }, [role]);

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
    <DrawerBodyContext.Provider value={setDrawerBody}>
      <div className="min-h-screen overflow-x-clip text-ink">
        <PlatformMesh />
        <div className={`relative z-10 min-h-screen ${collapsed ? 'md:pl-[100px]' : 'md:pl-[296px]'}`}>
          {mobileOpen ? (
            <button type="button" aria-label="Close navigation" className="fixed inset-0 z-20 bg-base/60 md:hidden" onClick={() => setMobileOpen(false)} />
          ) : null}
          <Suspense fallback={null}>
            <PlatformSidebar
              role={role}
              collapsed={collapsed}
              mobileOpen={mobileOpen}
              counts={counts}
              onNavigate={() => setMobileOpen(false)}
              onToggleCollapsed={() => setCollapsed((current) => !current)}
            />
          </Suspense>
          <div className="flex min-h-screen flex-col gap-3 p-3 md:pl-0">
            <Suspense fallback={null}>
              <PlatformTopBar
                displayName={displayName}
                role={role}
                counts={counts}
                onOpenRail={() => setMobileOpen(true)}
                onOpenPalette={() => setPalette(true)}
              />
            </Suspense>
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>
        <Suspense fallback={null}>
          <PlatformDrawer>{drawerBody}</PlatformDrawer>
        </Suspense>
        <CommandPalette role={role} open={palette} onClose={() => setPalette(false)} />
        <AssistantWidget role={role} displayName={displayName} />
      </div>
    </DrawerBodyContext.Provider>
  );
}
