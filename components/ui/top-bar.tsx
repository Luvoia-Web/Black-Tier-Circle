/**
 * @file components/ui/top-bar.tsx
 *
 * Dashboard top bar with page title, theme toggle, and mobile menu.
 *
 * @module Components
 */

'use client';

import { motion } from 'framer-motion';
import { Menu, Search } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { usePathname } from 'next/navigation';
import { FADE_UP } from '@/lib/animations';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { UserRole } from '@/modules/identity/types';
import { ROUTES } from '@/lib/navigation';

type TopBarProps = {
  readonly displayName: string;
  readonly role: UserRole;
  readonly avatarUrl?: string | null;
  readonly onMenuClick: () => void;
};

type TitleMeta = {
  readonly title: string;
  readonly crumb: string;
};

function titleForPath(pathname: string, role: UserRole): TitleMeta {
  const home = role === 'owner' ? ROUTES.owner.home : ROUTES.reseller.home;
  const map: ReadonlyArray<readonly [string, TitleMeta]> = [
    [ROUTES.owner.resellersInvite, { title: 'Invite reseller', crumb: 'Resellers' }],
    [ROUTES.owner.resellers, { title: 'Resellers', crumb: 'Management' }],
    [ROUTES.owner.productNew, { title: 'New product', crumb: 'Products' }],
    [ROUTES.owner.products, { title: 'Products', crumb: 'Catalog' }],
    [ROUTES.owner.orders, { title: 'Orders', crumb: 'Operations' }],
    [ROUTES.owner.fulfillment, { title: 'Fulfillment', crumb: 'Operations' }],
    [ROUTES.owner.supplier, { title: 'Supplier', crumb: 'Management' }],
    [ROUTES.owner.payments, { title: 'Payments', crumb: 'Management' }],
    [ROUTES.owner.tokens, { title: 'Tokens', crumb: 'Management' }],
    [ROUTES.owner.wallets, { title: 'Wallets', crumb: 'Wallet' }],
    [ROUTES.owner.bots, { title: 'Bots', crumb: 'Management' }],
    [ROUTES.owner.launch, { title: 'Launch Readiness', crumb: 'Management' }],
    [ROUTES.owner.intelligence, { title: 'Operations Control Tower', crumb: 'Intelligence' }],
    [ROUTES.owner.assistant, { title: 'AI Assistant', crumb: 'Help' }],
    [ROUTES.owner.settings, { title: 'Settings', crumb: 'Settings' }],
    [ROUTES.reseller.settingsApiKeys, { title: 'Developer API', crumb: 'Settings' }],
    [ROUTES.reseller.settingsWebhooks, { title: 'Webhooks', crumb: 'Settings' }],
    [ROUTES.reseller.assistant, { title: 'AI Assistant', crumb: 'Help' }],
    [ROUTES.reseller.account, { title: 'Account', crumb: 'Profile' }],
    [ROUTES.reseller.settings, { title: 'Settings', crumb: 'Settings' }],
    [ROUTES.reseller.orders, { title: 'Orders', crumb: 'Store' }],
    [ROUTES.reseller.deliveries, { title: 'Deliveries', crumb: 'Operations' }],
    [ROUTES.reseller.deposits, { title: 'Deposits', crumb: 'Wallet' }],
    [ROUTES.reseller.customers, { title: 'Customers', crumb: 'Operations' }],
    [ROUTES.reseller.products, { title: 'Catalog & Pricing', crumb: 'Store' }],
    [ROUTES.reseller.bills, { title: 'My Bills', crumb: 'Operations' }],
    [ROUTES.reseller.bot, { title: 'My Bot', crumb: 'Operations' }],
    [home, { title: 'Dashboard', crumb: 'Overview' }],
  ];
  const match = map.find(([href]) => pathname === href || pathname.startsWith(`${href}/`));
  return match?.[1] ?? { title: 'Dashboard', crumb: 'Overview' };
}

/**
 * Renders the dashboard top bar.
 *
 * @param props - User display fields and mobile menu handler
 */
function initialsFromName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? 'B';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return `${first}${second}`.toUpperCase();
}

export function TopBar({ displayName, role, avatarUrl = null, onMenuClick }: TopBarProps): JSX.Element {
  const pathname = usePathname();
  const meta = titleForPath(pathname, role);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--border-ghost)] bg-[var(--surface-0)]/90 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[var(--bg-raised)] text-[var(--text-1)] hover:bg-[var(--bg-hover)] md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={16} aria-hidden="true" />
        </button>
        <motion.div key={pathname} className="min-w-0" initial={FADE_UP.initial} animate={FADE_UP.animate} transition={FADE_UP.transition}>
          <p className="truncate text-base font-semibold text-[var(--text-1)]">{meta.title}</p>
          <p className="hidden text-sm text-[var(--text-2)] sm:block">{meta.crumb}</p>
        </motion.div>
      </div>
      <button
        type="button"
        className="hidden h-9 min-w-[220px] items-center gap-2 rounded-full border border-[var(--border-ghost)] bg-[var(--surface-1)] px-3 text-left text-xs text-[var(--text-3)] md:flex"
        onClick={() => window.dispatchEvent(new Event('btc:command'))}
      >
        <Search size={14} aria-hidden="true" />
        Search
        <span className="ml-auto rounded-md border border-[var(--border-soft)] px-1.5 py-0.5 font-mono text-[10px]">⌘K</span>
      </button>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <NotificationBell role={role} />
        <span className="avatar-ring hidden h-9 w-9 items-center justify-center rounded-full p-[2px] sm:flex" title={displayName}>
          <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[var(--bg-card)] text-[10px] font-semibold text-[var(--text-1)]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initialsFromName(displayName)
            )}
          </span>
        </span>
      </div>
    </header>
  );
}

export default TopBar;
