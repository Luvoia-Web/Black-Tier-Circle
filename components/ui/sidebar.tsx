/**
 * @file components/ui/sidebar.tsx
 *
 * Collapsible dashboard sidebar with role-specific navigation.
 *
 * @module Components
 */

'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot,
  ChevronLeft,
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
import { useEffect, useState } from 'react';

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly badge?: number;
};

type NavGroup = {
  readonly label: string | null;
  readonly items: ReadonlyArray<NavItem>;
};

type SidebarProps = {
  readonly role: UserRole;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
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
  avatarUrl = null,
  open,
  collapsed,
  onClose,
  onToggleCollapsed,
}: SidebarProps): JSX.Element {
  const pathname = usePathname();
  const [pendingReview, setPendingReview] = useState(0);
  const [pendingResellers, setPendingResellers] = useState(0);
  const groups = (role === 'owner' ? OWNER_GROUPS : RESELLER_GROUPS).map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.href === ROUTES.owner.supplier && pendingReview > 0
        ? { ...item, badge: pendingReview }
        : item.href === ROUTES.owner.resellers && pendingResellers > 0
          ? { ...item, badge: pendingResellers }
          : item,
    ),
  }));
  const [signingOut, setSigningOut] = useState(false);
  const widthClass = collapsed ? 'w-16' : 'w-[var(--sidebar-w)]';

  useEffect(() => {
    if (role !== 'owner') {
      return;
    }
    void fetch(API_ROUTES.supplierBalance)
      .then(async (response) => {
        const json = (await response.json()) as { success?: boolean; data?: { pendingReviewCount?: number } };
        if (json.success && json.data?.pendingReviewCount) {
          setPendingReview(json.data.pendingReviewCount);
        }
      })
      .catch(() => undefined);
    void fetch(`${API_ROUTES.resellers}?limit=100`)
      .then(async (response) => {
        const json = (await response.json()) as {
          success?: boolean;
          data?: Array<{ status?: string }> | { rows?: Array<{ status?: string }> };
        };
        const list = Array.isArray(json.data) ? json.data : json.data?.rows ?? [];
        if (json.success) {
          setPendingResellers(list.filter((row) => row.status === 'pending').length);
        }
      })
      .catch(() => undefined);
  }, [role]);

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
        className={`fixed inset-y-0 left-0 z-50 flex h-screen ${widthClass} flex-col overflow-x-hidden overflow-y-auto border-r border-[var(--border)] bg-[var(--sidebar-bg)]/80 backdrop-blur-xl transition-[width] duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-3">
          <span className="flex min-w-0 items-center gap-2">
            <DiamondMark />
            {collapsed ? null : (
              <p className="truncate text-sm font-semibold text-[var(--text-1)]">Black Tier Circle</p>
            )}
          </span>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden h-11 w-11 cursor-pointer items-center justify-center rounded-[var(--r-sm)] text-[var(--text-3)] hover:bg-[var(--bg-raised)] hover:text-[var(--text-1)] md:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <motion.span animate={{ rotate: collapsed ? 180 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
              <ChevronLeft size={16} aria-hidden="true" />
            </motion.span>
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {groups.map((group, groupIndex) => (
            <div key={group.label ?? 'primary'} className={group.label ? 'mt-4' : ''}>
              {group.label && !collapsed ? (
                <p className="mb-1 px-3 text-xs uppercase tracking-widest text-[var(--text-3)]">
                  {group.label}
                </p>
              ) : null}
              {group.items.map((item, itemIndex) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (groupIndex * 4 + itemIndex) * 0.04 }}
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Link
                      href={item.href}
                      onClick={onClose}
                      title={item.label}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--r-md)] border-l-2 px-3 py-2 text-sm ${
                        active
                          ? 'border-[var(--accent-soft)] bg-[rgba(139,92,246,0.15)] font-medium text-[var(--text-1)]'
                          : 'border-transparent text-[var(--text-2)] hover:border-[var(--accent-soft)] hover:bg-[rgba(139,92,246,0.1)] hover:text-[var(--text-1)]'
                      }`}
                    >
                      <Icon size={20} aria-hidden="true" className={active ? 'text-[var(--accent-soft)]' : ''} />
                      {collapsed ? null : item.label}
                      {!collapsed && item.badge ? (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--amber)] px-1 text-[10px] font-semibold text-black"
                          aria-label={`${item.badge} pending`}
                        >
                          {item.badge}
                        </motion.span>
                      ) : null}
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="group/user border-t border-[var(--border)] p-3">
          <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
            <span className="avatar-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-[2px]">
              <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[var(--accent)] text-xs font-semibold text-white">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initialsFromName(displayName)
                )}
              </span>
            </span>
            {collapsed ? null : (
              <div className="min-w-0">
                <p className="truncate text-sm text-[var(--text-1)]">{displayName}</p>
                <p className="text-xs uppercase tracking-wide text-[var(--text-3)]">{ROLE_LABEL[role]}</p>
              </div>
            )}
          </div>
          {collapsed || role !== 'reseller' ? null : (
            <Link
              href={ROUTES.reseller.account}
              onClick={onClose}
              className="mt-2 flex min-h-11 items-center text-sm text-[var(--text-2)] hover:text-[var(--text-1)]"
            >
              Account
            </Link>
          )}
          {collapsed ? null : (
            <button
              type="button"
              onClick={() => {
                void handleSignOut();
              }}
              disabled={signingOut}
              className="mt-2 flex min-h-11 w-full items-center text-left text-sm text-[var(--text-3)] hover:text-[var(--red)] disabled:opacity-60"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function DiamondMark(): JSX.Element {
  return (
    <svg className="css-orb h-4 w-4 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.2 14.2 8 8 14.8 1.8 8 8 1.2z" fill="var(--accent-soft)" />
    </svg>
  );
}

export default Sidebar;
