/**
 * Sidebar destinations. Screens that are rebuilt in later steps link to the
 * page that already works, so nothing here 404s.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BadgePercent,
  Bot,
  CreditCard,
  LayoutDashboard,
  LineChart,
  Megaphone,
  Package,
  Radio,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Ticket,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { ROUTES } from '@/lib/navigation';
import type { UserRole } from '@/modules/identity/types';

export type NavBadge = 'orders' | 'support' | 'resellers';

export type NavLink = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly badge?: NavBadge;
  readonly ownerOnly?: boolean;
  readonly children?: readonly { readonly id: string; readonly label: string; readonly href: string }[];
};

export type NavGroup = {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavLink[];
};

const ownerGroups: readonly NavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'overview', label: 'Overview', href: ROUTES.platform.overview, icon: LayoutDashboard },
      { id: 'analytics', label: 'Analytics', href: ROUTES.platform.analytics, icon: LineChart },
      { id: 'intelligence', label: 'Intelligence', href: ROUTES.platform.intelligence, icon: Sparkles },
      { id: 'remy', label: 'Remy AI', href: ROUTES.platform.remy, icon: Bot },
    ],
  },
  {
    id: 'commerce',
    label: 'Commerce',
    items: [
      { id: 'orders', label: 'Orders', href: ROUTES.platform.orders, icon: ShoppingBag, badge: 'orders' },
      {
        id: 'products',
        label: 'Products',
        href: ROUTES.platform.catalog,
        icon: Package,
        children: [
          { id: 'catalogue', label: 'Catalogue', href: ROUTES.platform.catalog },
          { id: 'inventory', label: 'Inventory', href: `${ROUTES.platform.catalog}?stock=out` },
          { id: 'pricing', label: 'Pricing rules', href: `${ROUTES.platform.catalog}?sort=title` },
        ],
      },
      {
        id: 'suppliers',
        label: 'Suppliers',
        href: ROUTES.platform.catalog,
        icon: Truck,
        children: [
          { id: 'connected', label: 'Connected', href: ROUTES.platform.catalog },
          { id: 'import', label: 'Import catalog', href: `${ROUTES.platform.catalog}?stage=not_imported` },
          { id: 'supplier-orders', label: 'Supplier orders', href: `${ROUTES.platform.orders}?attention=fulfillment` },
          { id: 'health', label: 'Health', href: ROUTES.platform.supplierHealth },
        ],
      },
      {
        id: 'customers',
        label: 'Customers',
        href: `${ROUTES.platform.people}?type=buyer`,
        icon: Users,
        badge: 'support',
        children: [
          { id: 'buyers', label: 'Buyers', href: `${ROUTES.platform.people}?type=buyer` },
          { id: 'support', label: 'Support inbox', href: `${ROUTES.platform.people}?type=buyer` },
        ],
      },
    ],
  },
  {
    id: 'network',
    label: 'Network',
    items: [
      { id: 'resellers', label: 'Resellers', href: `${ROUTES.platform.people}?type=reseller`, icon: Store, badge: 'resellers' },
      {
        id: 'wallets',
        label: 'Wallets & ledger',
        href: ROUTES.platform.money,
        icon: Wallet,
        children: [
          { id: 'reseller-wallets', label: 'Reseller wallets', href: ROUTES.platform.money },
          { id: 'tokens', label: 'Credit tokens', href: `${ROUTES.platform.money}?section=tokens` },
          { id: 'ledger', label: 'Ledger', href: `${ROUTES.platform.money}?section=ledger` },
        ],
      },
      {
        id: 'payments',
        label: 'Payments',
        href: ROUTES.platform.money,
        icon: CreditCard,
        children: [
          { id: 'topups', label: 'Top-ups', href: ROUTES.platform.money },
          { id: 'claims', label: 'Payment claims', href: ROUTES.platform.money },
          { id: 'methods', label: 'Payment methods', href: ROUTES.platform.settings },
        ],
      },
      { id: 'bots', label: 'Bots', href: ROUTES.platform.store, icon: Radio },
    ],
  },
  {
    id: 'growth',
    label: 'Growth',
    items: [
      {
        id: 'marketing',
        label: 'Marketing',
        href: ROUTES.platform.growth,
        icon: Megaphone,
        children: [
          { id: 'referrals', label: 'Referrals', href: ROUTES.platform.growth },
          { id: 'points', label: 'Points', href: ROUTES.platform.growth },
          { id: 'freebies', label: 'Freebies', href: ROUTES.platform.growth },
        ],
      },
      { id: 'discounts', label: 'Discounts', href: ROUTES.platform.growth, icon: Ticket },
      { id: 'broadcasts', label: 'Broadcasts & announcements', href: ROUTES.platform.growth, icon: BadgePercent },
    ],
  },
  {
    id: 'configure',
    label: 'Configure',
    items: [
      { id: 'studio', label: 'Bot Studio', href: ROUTES.platform.store, icon: Bot },
      { id: 'settings', label: 'Settings', href: ROUTES.platform.settings, icon: Settings },
      { id: 'system', label: 'System health', href: ROUTES.platform.health, icon: Activity },
    ],
  },
];

const resellerGroups: readonly NavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'overview', label: 'Overview', href: ROUTES.platform.overview, icon: LayoutDashboard },
      { id: 'analytics', label: 'Analytics', href: ROUTES.platform.analytics, icon: LineChart },
      { id: 'remy', label: 'Remy AI', href: ROUTES.platform.remy, icon: Bot },
    ],
  },
  {
    id: 'store',
    label: 'Store',
    items: [
      { id: 'orders', label: 'Orders', href: ROUTES.platform.orders, icon: ShoppingBag, badge: 'orders' },
      { id: 'products', label: 'Products', href: ROUTES.platform.catalog, icon: Package },
      { id: 'customers', label: 'Customers', href: ROUTES.platform.people, icon: Users, badge: 'support' },
      { id: 'marketing', label: 'Marketing', href: ROUTES.platform.growth, icon: Megaphone },
      { id: 'discounts', label: 'Discounts', href: ROUTES.platform.growth, icon: Ticket },
      { id: 'wallet', label: 'Wallet', href: ROUTES.platform.money, icon: Wallet },
      { id: 'studio', label: 'Bot & Studio', href: ROUTES.platform.store, icon: Radio },
      { id: 'settings', label: 'Settings', href: ROUTES.platform.settings, icon: Settings },
    ],
  },
];

export function navGroupsFor(role: UserRole): readonly NavGroup[] {
  return role === 'owner' ? ownerGroups : resellerGroups;
}

export function flatNav(role: UserRole): readonly NavLink[] {
  return navGroupsFor(role).flatMap((group) => group.items);
}

export type NavCounts = {
  readonly orders: number;
  readonly support: number;
  readonly resellers: number;
  readonly live: number;
  readonly revenueMinor: string;
};

export const EMPTY_COUNTS: NavCounts = {
  orders: 0,
  support: 0,
  resellers: 0,
  live: 0,
  revenueMinor: '0',
};
