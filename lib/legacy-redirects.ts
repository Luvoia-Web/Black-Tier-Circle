/**
 * Permanent homes for the old owner and reseller dashboard pages.
 * The same table is applied by middleware and next.config.
 */

import rules from '@/lib/legacy-redirects.json';

type Rule = { readonly source: string; readonly destination: string };

const compiled = (rules as readonly Rule[]).map((rule) => {
  const names: string[] = [];
  const source = rule.source.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    names.push(name);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${source}$`), names, destination: rule.destination };
});

/**
 * Returns the new path, including its query string, for an old dashboard URL.
 *
 * @param pathname - Request pathname without a query string
 */
export function legacyDestination(pathname: string): string | null {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  for (const rule of compiled) {
    const match = rule.regex.exec(path);
    if (!match) {
      continue;
    }
    let destination = rule.destination;
    rule.names.forEach((name, index) => {
      destination = destination.split(`:${name}`).join(match[index + 1] ?? '');
    });
    return destination;
  }
  return null;
}
