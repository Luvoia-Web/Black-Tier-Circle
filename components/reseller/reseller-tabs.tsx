/**
 * @file components/reseller/reseller-tabs.tsx
 *
 * Sub-navigation for the reseller admin panel.
 *
 * @module Components
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/lib/navigation';

const TABS = [
  { href: ROUTES.reseller.home, label: 'Overview', exact: true },
  { href: ROUTES.reseller.orders, label: 'Orders' },
  { href: ROUTES.reseller.deliveries, label: 'Deliveries' },
  { href: ROUTES.reseller.deposits, label: 'Deposits' },
  { href: ROUTES.reseller.customers, label: 'Wallets' },
  { href: ROUTES.reseller.intelligence, label: 'Intelligence' },
  { href: ROUTES.reseller.products, label: 'Catalog & Pricing' },
  { href: ROUTES.reseller.bills, label: 'My Bills' },
  { href: ROUTES.reseller.settings, label: 'Settings' },
  { href: ROUTES.reseller.settingsApiKeys, label: 'Developer API' },
] as const;

export function ResellerTabs(): JSX.Element {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
      {TABS.map((tab) => {
        const active =
          'exact' in tab && tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-3 py-1.5 text-xs ${
              active
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-2)] hover:bg-[var(--bg-raised)] hover:text-[var(--text-1)]'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
