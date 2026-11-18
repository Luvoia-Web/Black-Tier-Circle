/**
 * Sidebar destinations. Screens that are rebuilt in later steps link to the
 * page that already works, so nothing here 404s.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bot,
  BrainCircuit,
  ChartColumnBig,
  CreditCard,
  LayoutDashboard,
  Megaphone,
  Package,
  Palette,
  RadioTower,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  TicketPercent,
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
      { id: 'analytics', label: 'Analytics', href: ROUTES.platform.analytics, icon: ChartColumnBig },
      { id: 'intelligence', label: 'Intelligence', href: ROUTES.platform.intelligence, icon: BrainCircuit },
      { id: 'remy', label: 'Remy AI', href: ROUTES.platform.remy, icon: Sparkles },
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
          { id: 'inventory', label: 'Inventory', href: `${ROUTES.platform.catalog}?section=inventory` },
          { id: 'pricing', label: 'Pricing rules', href: `${ROUTES.platform.catalog}?section=pricing` },
        ],
      },
      { id: 'suppliers', label: 'Suppliers', href: `${ROUTES.platform.catalog}?section=suppliers`, icon: Truck },
      {
        id: 'customers',
        label: 'Customers',
        href: `${ROUTES.platform.people}?type=buyer`,
        icon: Users,
        badge: 'support',
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
      },
      { id: 'payments', label: 'Payments', href: `${ROUTES.platform.money}?section=payments`, icon: CreditCard },
      { id: 'bots', label: 'Bots', href: `${ROUTES.platform.store}?section=bots`, icon: Bot },
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
      },
      { id: 'discounts', label: 'Discounts', href: `${ROUTES.platform.growth}?section=discounts`, icon: TicketPercent },
      { id: 'broadcasts', label: 'Broadcasts', href: `${ROUTES.platform.growth}?section=broadcasts`, icon: RadioTower },
    ],
  },
  {
    id: 'configure',
    label: 'Configure',
    items: [
      { id: 'studio', label: 'Bot Studio', href: ROUTES.platform.store, icon: Palette },
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
      { id: 'analytics', label: 'Analytics', href: ROUTES.platform.analytics, icon: ChartColumnBig },
      { id: 'remy', label: 'Remy AI', href: ROUTES.platform.remy, icon: Sparkles },
    ],
  },
  {
    id: 'store',
    label: 'Store',
    items: [
      { id: 'orders', label: 'Orders', href: ROUTES.platform.orders, icon: ShoppingBag, badge: 'orders' },
      {
        id: 'products',
        label: 'Products',
        href: ROUTES.platform.catalog,
        icon: Package,
        children: [
          { id: 'catalogue', label: 'Catalogue', href: ROUTES.platform.catalog },
          { id: 'inventory', label: 'Inventory', href: `${ROUTES.platform.catalog}?section=inventory` },
          { id: 'pricing', label: 'Pricing rules', href: `${ROUTES.platform.catalog}?section=pricing` },
        ],
      },
      { id: 'customers', label: 'Customers', href: ROUTES.platform.people, icon: Users, badge: 'support' },
      { id: 'marketing', label: 'Marketing', href: ROUTES.platform.growth, icon: Megaphone },
      { id: 'discounts', label: 'Discounts', href: `${ROUTES.platform.growth}?section=discounts`, icon: TicketPercent },
      { id: 'wallet', label: 'Wallet', href: ROUTES.platform.money, icon: Wallet },
      { id: 'studio', label: 'Bot & Studio', href: ROUTES.platform.store, icon: Palette },
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
