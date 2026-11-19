/**
 * Sidebar hrefs. The page checker imports this file, so a new item is visited
 * automatically. Two top-level items must not share a pathname.
 */

export const ownerNav = [
  { id: 'overview', href: '/overview' },
  { id: 'analytics', href: '/analytics' },
  { id: 'intelligence', href: '/intelligence' },
  { id: 'remy', href: '/remy' },
  { id: 'orders', href: '/orders', panels: ['/orders?chip=attention', '/orders?chip=awaiting', '/orders?chip=delivered', '/orders?chip=failed'] },
  {
    id: 'products',
    href: '/catalog',
    children: [
      { id: 'catalogue', href: '/catalog' },
      { id: 'inventory', href: '/catalog?section=inventory' },
      { id: 'pricing', href: '/catalog?section=pricing' },
    ],
  },
  {
    id: 'suppliers',
    href: '/catalog?section=suppliers',
    panels: [
      '/catalog?section=suppliers&panel=connected',
      '/catalog?section=suppliers&panel=import',
      '/catalog?section=suppliers&panel=orders',
      '/catalog?section=suppliers&panel=health',
    ],
  },
  { id: 'customers', href: '/customers' },
  { id: 'resellers', href: '/resellers' },
  { id: 'wallets', href: '/wallets' },
  { id: 'payments', href: '/payments' },
  { id: 'bots', href: '/bots' },
  { id: 'marketing', href: '/marketing' },
  { id: 'discounts', href: '/discounts' },
  { id: 'broadcasts', href: '/broadcasts' },
  { id: 'studio', href: '/bot-studio' },
  { id: 'settings', href: '/settings' },
  { id: 'system', href: '/system-health' },
];

export const resellerNav = [
  { id: 'overview', href: '/overview' },
  { id: 'analytics', href: '/analytics' },
  { id: 'remy', href: '/remy' },
  { id: 'orders', href: '/orders' },
  {
    id: 'products',
    href: '/catalog',
    children: [
      { id: 'catalogue', href: '/catalog' },
      { id: 'inventory', href: '/catalog?section=inventory' },
      { id: 'pricing', href: '/catalog?section=pricing' },
    ],
  },
  { id: 'customers', href: '/customers' },
  { id: 'marketing', href: '/marketing' },
  { id: 'discounts', href: '/discounts' },
  { id: 'wallet', href: '/wallets' },
  { id: 'bots', href: '/bots' },
  { id: 'studio', href: '/bot-studio' },
  { id: 'settings', href: '/settings' },
];

export function routesFor(role) {
  const groups = role === 'owner' ? ownerNav : resellerNav;
  const routes = [];
  for (const item of groups) {
    routes.push(item.href);
    for (const child of item.children ?? []) routes.push(child.href);
    for (const panel of item.panels ?? []) routes.push(panel);
  }
  return [...new Set(routes)];
}

export function duplicatePaths(role) {
  const seen = new Map();
  const dupes = [];
  for (const item of role === 'owner' ? ownerNav : resellerNav) {
    const previous = seen.get(item.href);
    if (previous) dupes.push(`${previous} and ${item.id} both open ${item.href}`);
    else seen.set(item.href, item.id);
  }
  return dupes;
}
