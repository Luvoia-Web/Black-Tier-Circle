/**
 * @file components/ui/sidebar.tsx
 *
 * Collapsible dashboard sidebar with role-specific navigation.
 *
 * @module Components
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Code2,
  CreditCard,
  DollarSign,
  Key,
  LayoutDashboard,
  Package,
  PackageCheck,
  Receipt,
  Rocket,
  Send,
  Settings,
  ShoppingBag,
  Truck,
  UserCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/modules/identity/types';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useState } from 'react';

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
};

type NavGroup = {
  readonly label: string | null;
  readonly items: ReadonlyArray<NavItem>;
};

type SidebarProps = {
  readonly role: UserRole;
  readonly displayName: string;
  readonly open: boolean;
  readonly collapsed: boolean;
  readonly onClose: () => void;
  readonly onToggleCollapsed: () => void;
};

const OWNER_GROUPS: ReadonlyArray<NavGroup> = [
  {
    label: null,
    items: [
      { href: ROUTES.owner.home, label: 'Dashboard', icon: LayoutDashboard },
      { href: ROUTES.owner.orders, label: 'Orders', icon: ShoppingBag },
      { href: ROUTES.owner.products, label: 'Products', icon: Package },
      { href: ROUTES.owner.wallets, label: 'Wallet', icon: CreditCard },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: ROUTES.owner.resellers, label: 'Resellers', icon: Users },
      { href: ROUTES.owner.payments, label: 'Payments', icon: DollarSign },
      { href: ROUTES.owner.tokens, label: 'Tokens', icon: Key },
      { href: ROUTES.owner.supplier, label: 'Supplier', icon: Truck },
      { href: ROUTES.owner.fulfillment, label: 'Fulfillment', icon: PackageCheck },
      { href: ROUTES.owner.bots, label: 'Bots', icon: Bot },
      { href: ROUTES.owner.launch, label: 'Launch', icon: Rocket },
    ],
  },
  {
    label: 'Settings',
    items: [{ href: ROUTES.owner.settings, label: 'Settings', icon: Settings }],
  },
];

const RESELLER_GROUPS: ReadonlyArray<NavGroup> = [
  {
    label: null,
    items: [
      { href: ROUTES.reseller.home, label: 'Dashboard', icon: LayoutDashboard },
      { href: ROUTES.reseller.orders, label: 'Orders', icon: ShoppingBag },
      { href: ROUTES.reseller.products, label: 'Products', icon: Package },
      { href: ROUTES.reseller.deposits, label: 'Wallet', icon: CreditCard },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: ROUTES.reseller.deliveries, label: 'Deliveries', icon: Send },
      { href: ROUTES.reseller.customers, label: 'Customers', icon: UserCircle },
      { href: ROUTES.reseller.bills, label: 'My Bills', icon: Receipt },
      { href: ROUTES.reseller.bot, label: 'My Bot', icon: Bot },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: ROUTES.reseller.settings, label: 'Settings', icon: Settings },
      { href: ROUTES.reseller.settingsApiKeys, label: 'Developer API', icon: Code2 },
    ],
  },
];

const ROLE_LABEL: Record<UserRole, string> = {
  owner: 'Owner',
  reseller: 'Reseller',
  staff: 'Staff',
};

function isActive(pathname: string, href: string): boolean {
  if (href === ROUTES.owner.home || href === ROUTES.reseller.home) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsFromName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? 'B';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return `${first}${second}`.toUpperCase();
}

/**
 * Renders owner or reseller navigation. Overlay drawer on small screens.
 *
 * @param props - Role, open state, collapse state, and handlers
 */
export function Sidebar({
  role,
  displayName,
  open,
  collapsed,
  onClose,
  onToggleCollapsed,
}: SidebarProps): JSX.Element {
  const pathname = usePathname();
  const groups = role === 'owner' ? OWNER_GROUPS : RESELLER_GROUPS;
  const [signingOut, setSigningOut] = useState(false);
  const widthClass = collapsed ? 'w-16' : 'w-[var(--sidebar-w)]';

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
    <>
      <button
        type="button"
        aria-label="Close navigation"
        className={`fixed inset-0 z-30 bg-black/60 md:hidden ${open ? 'block' : 'hidden'}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex ${widthClass} flex-col border-r border-[var(--border)] bg-[var(--sidebar-bg)] transition-all duration-200 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-[52px] items-center justify-between border-b border-[var(--border)] px-3">
          {collapsed ? (
            <span className="text-sm font-semibold text-[var(--text-1)]">◆</span>
          ) : (
            <p className="truncate text-sm font-semibold text-[var(--text-1)]">◆ Black Tier Circle</p>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden h-7 w-7 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-3)] hover:bg-[var(--bg-raised)] hover:text-[var(--text-1)] md:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {groups.map((group) => (
            <div key={group.label ?? 'primary'} className={group.label ? 'mt-4' : ''}>
              {group.label && !collapsed ? (
                <p className="mb-1 px-3 text-[10px] uppercase tracking-widest text-[var(--text-3)]">
                  {group.label}
                </p>
              ) : null}
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    title={item.label}
                    className={`flex items-center gap-2.5 rounded-[var(--r-md)] px-3 py-2 text-sm ${
                      active
                        ? 'bg-[var(--bg-raised)] font-medium text-[var(--text-1)]'
                        : 'text-[var(--text-2)] hover:bg-[var(--bg-raised)] hover:text-[var(--text-1)]'
                    }`}
                  >
                    <Icon size={18} />
                    {collapsed ? null : item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-[var(--border)] p-3">
          <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white">
              {initialsFromName(displayName)}
            </span>
            {collapsed ? null : (
              <div className="min-w-0">
                <p className="truncate text-sm text-[var(--text-1)]">{displayName}</p>
                <p className="text-[10px] uppercase tracking-wide text-[var(--text-3)]">{ROLE_LABEL[role]}</p>
              </div>
            )}
          </div>
          {collapsed ? null : (
            <button
              type="button"
              onClick={() => {
                void handleSignOut();
              }}
              disabled={signingOut}
              className="mt-2 w-full text-left text-xs text-[var(--text-3)] hover:text-[var(--red)] disabled:opacity-60"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
