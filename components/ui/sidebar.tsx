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
import type { UserRole } from '@/modules/identity/types';
import { ROUTES } from '@/lib/navigation';

export type NavItem = {
  readonly href: string;
  readonly label: string;
};

type SidebarProps = {
  readonly role: UserRole;
  readonly open: boolean;
  readonly onClose: () => void;
};

const OWNER_NAV: ReadonlyArray<NavItem> = [
  { href: ROUTES.owner.home, label: 'Dashboard' },
  { href: ROUTES.owner.products, label: 'Products' },
  { href: ROUTES.owner.resellers, label: 'Resellers' },
  { href: ROUTES.owner.tokens, label: 'Tokens' },
  { href: ROUTES.owner.wallets, label: 'Wallets' },
  { href: ROUTES.owner.orders, label: 'Orders' },
  { href: ROUTES.owner.settings, label: 'Settings' },
];

const RESELLER_NAV: ReadonlyArray<NavItem> = [
  { href: ROUTES.reseller.home, label: 'Dashboard' },
  { href: ROUTES.reseller.bot, label: 'My Bot' },
  { href: ROUTES.reseller.products, label: 'Products' },
  { href: ROUTES.reseller.wallet, label: 'Wallet' },
  { href: ROUTES.reseller.orders, label: 'Orders' },
  { href: ROUTES.reseller.settings, label: 'Settings' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === ROUTES.owner.home || href === ROUTES.reseller.home) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Renders owner or reseller navigation. Overlay drawer on small screens.
 *
 * @param props - Role, open state, and close handler
 */
export function Sidebar({ role, open, onClose }: SidebarProps): JSX.Element {
  const pathname = usePathname();
  const items = role === 'owner' ? OWNER_NAV : RESELLER_NAV;

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        className={`fixed inset-0 z-30 bg-black/60 lg:hidden ${open ? 'block' : 'hidden'}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-800 bg-gray-900 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-gray-800 px-5 py-4">
          <p className="text-sm font-semibold tracking-wide text-indigo-400">Black Tier Circle</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  active
                    ? 'bg-gray-800 text-gray-100'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
