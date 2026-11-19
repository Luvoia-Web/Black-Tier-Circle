/**
 * Sidebar destinations. Hrefs live in nav-manifest.mjs so the page checker
 * visits the same list.
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
import { ownerNav, resellerNav } from '@/components/platform/nav-manifest.mjs';
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

type ManifestItem = {
  readonly id: string;
  readonly href: string;
  readonly children?: readonly { readonly id: string; readonly href: string }[];
};

const LABELS: Record<string, string> = {
  overview: 'Overview',
  analytics: 'Analytics',
  intelligence: 'Intelligence',
  remy: 'Remy AI',
  orders: 'Orders',
  products: 'Products',
  catalogue: 'Catalogue',
  inventory: 'Inventory',
  pricing: 'Pricing rules',
  suppliers: 'Suppliers',
  customers: 'Customers',
  resellers: 'Resellers',
  wallets: 'Wallets & ledger',
  payments: 'Payments',
  bots: 'Bots',
  marketing: 'Marketing',
  discounts: 'Discounts',
  broadcasts: 'Broadcasts',
  studio: 'Bot Studio',
  settings: 'Settings',
  system: 'System health',
  wallet: 'Wallet',
};

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  analytics: ChartColumnBig,
  intelligence: BrainCircuit,
  remy: Sparkles,
  orders: ShoppingBag,
  products: Package,
  suppliers: Truck,
  customers: Users,
  resellers: Store,
  wallets: Wallet,
  payments: CreditCard,
  bots: Bot,
  marketing: Megaphone,
  discounts: TicketPercent,
  broadcasts: RadioTower,
  studio: Palette,
  settings: Settings,
  system: Activity,
  wallet: Wallet,
};

const BADGES: Record<string, NavBadge | undefined> = {
  orders: 'orders',
  customers: 'support',
  resellers: 'resellers',
};

function toLink(item: ManifestItem): NavLink {
  const badge = BADGES[item.id];
  const link: NavLink = {
    id: item.id,
    label: LABELS[item.id] ?? item.id,
    href: item.href,
    icon: ICONS[item.id] ?? LayoutDashboard,
    ...(item.children
      ? { children: item.children.map((child) => ({ id: child.id, label: LABELS[child.id] ?? child.id, href: child.href })) }
      : {}),
  };
  return badge ? { ...link, badge } : link;
}

function pick(source: readonly ManifestItem[], ids: readonly string[]): NavLink[] {
  return ids.map((id) => source.find((item) => item.id === id)).filter((item): item is ManifestItem => Boolean(item)).map(toLink);
}

const ownerGroups: readonly NavGroup[] = [
  { id: 'workspace', label: 'Workspace', items: pick(ownerNav, ['overview', 'analytics', 'intelligence', 'remy']) },
  { id: 'commerce', label: 'Commerce', items: pick(ownerNav, ['orders', 'products', 'suppliers', 'customers']) },
  { id: 'network', label: 'Network', items: pick(ownerNav, ['resellers', 'wallets', 'payments', 'bots']) },
  { id: 'growth', label: 'Growth', items: pick(ownerNav, ['marketing', 'discounts', 'broadcasts']) },
  { id: 'configure', label: 'Configure', items: pick(ownerNav, ['studio', 'settings', 'system']) },
];

const resellerGroups: readonly NavGroup[] = [
  { id: 'workspace', label: 'Workspace', items: pick(resellerNav, ['overview', 'analytics', 'remy']) },
  { id: 'store', label: 'Store', items: pick(resellerNav, ['orders', 'products', 'customers', 'marketing', 'discounts', 'wallet', 'bots', 'studio', 'settings']) },
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
