/**
 * @file components/platform/top-bar.tsx
 *
 * Glass top bar. Shows the current area, opens the rail on a phone,
 * and holds the account menu.
 */

'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PLATFORM_AREAS } from '@/components/platform/areas';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { UserRole } from '@/modules/identity/types';

type TopBarProps = {
  readonly displayName: string;
  readonly role: UserRole;
  readonly onOpenRail: () => void;
  readonly onToggleCollapsed: () => void;
  readonly collapsed: boolean;
  readonly onOpenPalette: () => void;
};

export function PlatformTopBar({
  displayName,
  role,
  onOpenRail,
  onToggleCollapsed,
  collapsed,
  onOpenPalette,
}: TopBarProps): JSX.Element {
  const pathname = usePathname();
  const area = PLATFORM_AREAS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: MouseEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  return (
    <header className="glass-chrome sticky top-0 z-20 flex min-h-14 items-center gap-3 px-3 md:px-5">
      <button type="button" className="min-h-11 rounded-md px-3 text-sm text-ink md:hidden" onClick={onOpenRail}>
        Areas
      </button>
      <button
        type="button"
        className="hidden min-h-11 rounded-md px-3 text-sm text-ink-soft md:inline"
        aria-pressed={collapsed}
        onClick={onToggleCollapsed}
      >
        {collapsed ? 'Expand rail' : 'Collapse rail'}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{area?.label ?? 'Black Tier Circle'}</p>
        <p className="truncate text-xs text-ink-faint">{area?.description ?? ''}</p>
      </div>
      <button type="button" className="min-h-11 rounded-md border border-stroke px-3 text-sm text-ink-soft" onClick={onOpenPalette}>
        Search
        <span className="ml-2 hidden font-num text-xs text-ink-faint sm:inline">Ctrl K</span>
      </button>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="min-h-11 rounded-md px-3 text-sm text-ink"
          onClick={() => setMenuOpen((current) => !current)}
        >
          {displayName}
        </button>
        {menuOpen ? (
          <div role="menu" className="absolute right-0 mt-1 w-52 rounded-md border border-stroke bg-raised p-1">
            <p className="px-3 py-2 text-xs uppercase tracking-[0.12em] text-ink-faint">{role}</p>
            <button type="button" role="menuitem" className="block min-h-11 w-full rounded-md px-3 text-left text-sm text-ink" onClick={toggleTheme}>
              Switch theme
            </button>
            <button type="button" role="menuitem" className="block min-h-11 w-full rounded-md px-3 text-left text-sm text-ink" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function toggleTheme(): void {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('btc-theme', next);
  } catch {
    // The theme still applies for this view.
  }
}

async function signOut(): Promise<void> {
  try {
    await fetch(API_ROUTES.authLogout, { method: 'POST' });
  } catch {
    // The local session clear still runs.
  }
  window.location.assign(ROUTES.login);
}
