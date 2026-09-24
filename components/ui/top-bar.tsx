/**
 * @file components/ui/top-bar.tsx
 *
 * Dashboard top bar with page title, theme toggle, and mobile menu.
 *
 * @module Components
 */

'use client';

import { Menu } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { UserRole } from '@/modules/identity/types';
import { ROUTES } from '@/lib/navigation';

type TopBarProps = {
  readonly displayName: string;
  readonly role: UserRole;
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
export function TopBar({ displayName, role, onMenuClick }: TopBarProps): JSX.Element {
  const pathname = usePathname();
  const meta = titleForPath(pathname, role);

  return (
    <header className="flex h-[52px] items-center justify-between border-b border-[var(--border)] bg-[var(--bg-page)] px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-raised)] text-[var(--text-1)] hover:bg-[var(--bg-hover)] md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={16} />
        </button>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[var(--text-1)]">{meta.title}</p>
          <p className="hidden text-sm text-[var(--text-2)] sm:block">{meta.crumb}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-[var(--text-3)] sm:inline">{displayName}</span>
        <button
          type="button"
          aria-label="Search"
          onClick={() => window.dispatchEvent(new Event('btc:command'))}
          className="hidden h-8 items-center gap-2 rounded-full bg-[var(--bg-raised)] px-3 text-xs text-[var(--text-3)] hover:text-[var(--text-1)] sm:flex"
        >
          ⌘K
        </button>
        <ThemeToggle />
        <NotificationBell role={role} />
      </div>
    </header>
  );
}

export default TopBar;
