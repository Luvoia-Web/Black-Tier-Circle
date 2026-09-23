/**
 * @file components/ui/Breadcrumb.tsx
 *
 * Dashboard breadcrumb trail. The last segment is the current page.
 *
 * @module Components
 */

import Link from 'next/link';

export type BreadcrumbItem = {
  readonly label: string;
  readonly href?: string;
};

export function Breadcrumb({ items }: { readonly items: ReadonlyArray<BreadcrumbItem> }): JSX.Element {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-xs text-[var(--text-3)]">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden>/</span> : null}
              {last || !item.href ? (
                <span className={last ? 'text-[var(--text-2)]' : undefined}>{item.label}</span>
              ) : (
                <Link href={item.href} className="hover:text-[var(--text-1)]">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
