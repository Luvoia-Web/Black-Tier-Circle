'use client';

/**
 * Floating glass top bar: breadcrumb, command search, live buyers,
 * theme, notifications, the rose New menu, and the account menu.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, Moon, Plus, Search, Sun, UserRound } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { flatNav, type NavCounts } from '@/components/platform/nav';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { UserRole } from '@/modules/identity/types';

type TopBarProps = {
  readonly displayName: string;
  readonly role: UserRole;
  readonly counts: NavCounts;
  readonly onOpenRail: () => void;
  readonly onOpenPalette: () => void;
};

const NEW_LINKS = [
  { href: `${ROUTES.platform.catalog}?create=1`, label: 'New product', ownerOnly: true },
  { href: `${ROUTES.platform.catalog}?section=suppliers&panel=import`, label: 'Import from supplier', ownerOnly: true },
  { href: ROUTES.platform.resellers, label: 'Invite reseller', ownerOnly: true },
  { href: ROUTES.platform.discounts, label: 'New discount code', ownerOnly: false },
  { href: ROUTES.platform.broadcasts, label: 'New broadcast', ownerOnly: false },
] as const;

function accountInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => /^[a-zA-Z0-9]/.test(part));
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return 'BT';
}

export function PlatformTopBar({ displayName, role, counts, onOpenRail, onOpenPalette }: TopBarProps): JSX.Element {
  const pathname = usePathname();
  const params = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [mac, setMac] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  const links = flatNav(role);
  const current = links
    .filter((item) => {
      const url = new URL(item.href, 'http://local');
      if (url.pathname !== pathname && !(url.pathname !== '/' && pathname.startsWith(`${url.pathname}/`))) return false;
      for (const [key, value] of url.searchParams) {
        if (params.get(key) !== value) return false;
      }
      return true;
    })
    .sort((left, right) => right.href.length - left.href.length)[0];

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  useEffect(() => {
    function onPointer(event: MouseEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
      if (!createRef.current?.contains(event.target as Node)) setCreateOpen(false);
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setCreateOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <header className="glass-chrome flex min-h-bar items-center gap-1 rounded-xl px-2 sm:gap-2 sm:px-3">
      <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-ink md:hidden" aria-label="Open navigation" onClick={onOpenRail}>
        <Menu className="h-4 w-4" aria-hidden="true" />
      </button>
      <p className="hidden min-w-0 items-center gap-2 text-sm text-ink-soft sm:flex">
        <span>Black Tier Circle</span>
        <span aria-hidden="true">/</span>
        <span className="truncate text-ink">{current?.label ?? 'Overview'}</span>
      </p>
      <button
        type="button"
        aria-label={role === 'owner' ? 'Search orders, products, resellers' : 'Search orders, products, customers'}
        className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-stroke px-0 text-sm text-ink-faint sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-sm sm:justify-start sm:gap-2 sm:px-3"
        onClick={onOpenPalette}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden truncate sm:inline">
          {role === 'owner' ? 'Search orders, products, resellers...' : 'Search orders, products, customers...'}
        </span>
        <span className="ml-auto hidden rounded-md border border-stroke px-1.5 text-[11px] sm:inline">{mac ? '⌘K' : 'Ctrl K'}</span>
      </button>
      <p className="hidden items-center gap-2 rounded-pill border border-stroke px-3 py-2 text-xs text-ink-soft lg:flex">
        <span className="h-1.5 w-1.5 rounded-pill bg-mint" aria-hidden="true" />
        <span className="tabular-nums">{counts.live} active in bots</span>
      </p>
      <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-ink-soft" aria-label="Switch theme" onClick={toggleTheme}>
        <ThemeIcon />
      </button>
      <NotificationBell role={role} />
      <div ref={createRef} className="relative shrink-0">
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-pill bg-rose px-3 text-sm font-medium text-white"
          aria-expanded={createOpen}
          aria-haspopup="menu"
          onClick={() => setCreateOpen((currentOpen) => !currentOpen)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New
        </button>
        {createOpen ? (
          <div role="menu" className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-stroke bg-raised p-1 shadow-glass">
            {NEW_LINKS.filter((item) => role === 'owner' || !item.ownerOnly).map((item) => (
              <Link key={item.label} href={item.href} role="menuitem" className="block rounded-md px-3 py-2 text-sm text-ink hover:bg-rose/10" onClick={() => setCreateOpen(false)}>
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Account"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-pill border border-white/15 bg-white/90 text-xs font-semibold tracking-tight text-[#1a0d14] transition hover:opacity-95"
          onClick={() => setMenuOpen((currentOpen) => !currentOpen)}
        >
          {displayName ? accountInitials(displayName) : <UserRound className="h-4 w-4" aria-hidden="true" />}
        </button>
        {menuOpen ? (
          <div role="menu" className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-stroke bg-raised p-1 shadow-glass">
            <p className="px-3 py-2 text-sm text-ink">{displayName}</p>
            <p className="px-3 pb-2 text-xs uppercase tracking-[0.12em] text-ink-faint">{role}</p>
            <button type="button" role="menuitem" className="block min-h-10 w-full rounded-md px-3 text-left text-sm text-ink" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function ThemeIcon(): JSX.Element {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const read = (): void => setLight(document.documentElement.getAttribute('data-theme') === 'light');
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return light ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />;
}

function toggleTheme(): void {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('btc-theme', next);
    localStorage.setItem('btc-theme-v', '3');
  } catch {
    // The theme still applies for this view.
  }
}

async function signOut(): Promise<void> {
  try {
    await fetch(API_ROUTES.authLogout, { method: 'POST' });
  } catch {
    // The browser still leaves for the login page.
  }
  window.location.assign(ROUTES.login);
}
