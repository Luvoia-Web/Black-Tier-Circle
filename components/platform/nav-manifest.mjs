/**
 * Sidebar hrefs. The page checker imports this file, so a new item is visited
 * automatically. Two top-level items must not share a pathname.
 */

/** Every Bot Studio tab and message surface. The page checker visits each one. */
export const studioPanels = [
  '/bot-studio?section=home',
  '/bot-studio?section=home&surface=welcome',
  '/bot-studio?section=buttons',
  '/bot-studio?section=catalogue',
  '/bot-studio?section=catalogue&surface=categories',
  '/bot-studio?section=catalogue&surface=list',
  '/bot-studio?section=card',
  '/bot-studio?section=card&surface=footer',
  '/bot-studio?section=messages',
  '/bot-studio?section=messages&surface=sold',
  '/bot-studio?section=messages&surface=quantity',
  '/bot-studio?section=messages&surface=delivered',
  '/bot-studio?section=messages&surface=referral',
  '/bot-studio?section=messages&surface=freebie',
  '/bot-studio?section=messages&surface=support',
  '/bot-studio?section=messages&surface=maintenance',
  '/bot-studio?section=links',
  '/bot-studio?section=checkout',
  '/bot-studio?section=checkout&surface=confirm',
  '/bot-studio?section=checkout&surface=short',
  '/bot-studio?section=checkout&surface=placed',
];

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
  { id: 'customers', href: '/customers', panels: ['/customers?tab=support'] },
  { id: 'resellers', href: '/resellers' },
  { id: 'wallets', href: '/wallets' },
  { id: 'payments', href: '/payments' },
  { id: 'bots', href: '/bots' },
  { id: 'marketing', href: '/marketing' },
  { id: 'discounts', href: '/discounts' },
  { id: 'broadcasts', href: '/broadcasts' },
  { id: 'studio', href: '/bot-studio', panels: studioPanels },
  {
    id: 'settings',
    href: '/settings',
    panels: [
      '/settings?section=business',
      '/settings?section=legal',
      '/settings?section=policy',
      '/settings?section=pricing',
      '/settings?section=fraud',
      '/settings?section=notifications',
      '/settings?section=payments',
      '/settings?section=store',
      '/settings?section=integrations',
      '/settings?section=security',
      '/settings?section=danger',
    ],
  },
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
  { id: 'customers', href: '/customers', panels: ['/customers?tab=support'] },
  { id: 'marketing', href: '/marketing' },
  { id: 'discounts', href: '/discounts' },
  { id: 'wallet', href: '/wallets' },
  { id: 'bots', href: '/bots' },
  { id: 'studio', href: '/bot-studio', panels: studioPanels },
  {
    id: 'settings',
    href: '/settings',
    panels: ['/settings?section=account', '/settings?section=keys', '/settings?section=webhooks'],
  },
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
