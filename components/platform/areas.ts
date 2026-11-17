/**
 * @file components/platform/areas.ts
 *
 * The eight areas. Both roles use this list. Owner-only actions live inside
 * the pages, not as a second navigation.
 */

import { ROUTES } from '@/lib/navigation';

export type PlatformArea = {
  readonly href: string;
  readonly label: string;
  readonly description: string;
};

export const PLATFORM_AREAS: readonly PlatformArea[] = [
  { href: ROUTES.platform.today, label: 'Today', description: 'What needs action now' },
  { href: ROUTES.platform.catalog, label: 'Catalog', description: 'Every item and its stage' },
  { href: ROUTES.platform.orders, label: 'Orders', description: 'Payment, supplier, and delivery' },
  { href: ROUTES.platform.money, label: 'Money', description: 'Balances, top-ups, and debts' },
  { href: ROUTES.platform.people, label: 'People', description: 'Buyers, resellers, and support' },
  { href: ROUTES.platform.store, label: 'Store', description: 'How the shop presents itself' },
  { href: ROUTES.platform.growth, label: 'Growth', description: 'Referrals, codes, and broadcasts' },
  { href: ROUTES.platform.settings, label: 'Settings', description: 'Account, keys, and policy' },
];

export const SELECTION_STORAGE_KEY = 'platform-selection';

/**
 * Reads the catalog row ids chosen in this tab.
 */
export function readSelection(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const raw = window.sessionStorage.getItem(SELECTION_STORAGE_KEY) ?? '';
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Stores the catalog row ids chosen in this tab.
 *
 * @param ids - Supplier product or product ids
 */
export function writeSelection(ids: readonly string[]): void {
  window.sessionStorage.setItem(SELECTION_STORAGE_KEY, ids.join(','));
}

export const DRAWER_PARAMS = ['order', 'item', 'person', 'wallet', 'thread'] as const;

export type DrawerParam = (typeof DRAWER_PARAMS)[number];
