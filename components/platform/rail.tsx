/**
 * @file components/platform/rail.tsx
 *
 * Glass navigation for the eight areas. Collapses to icons.
 * On a small screen it is a sheet. The pointer sheen lives here only.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type MouseEvent } from 'react';
import { PLATFORM_AREAS } from '@/components/platform/areas';

type RailProps = {
  readonly collapsed: boolean;
  readonly mobileOpen: boolean;
  readonly onNavigate: () => void;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PlatformRail({ collapsed, mobileOpen, onNavigate }: RailProps): JSX.Element {
  const pathname = usePathname();
  const [sheen, setSheen] = useState(false);

  useEffect(() => {
    setSheen(!prefersReducedMotion());
  }, []);

  function moveSheen(event: MouseEvent<HTMLElement>): void {
    if (!sheen) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--sheen-x', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--sheen-y', `${event.clientY - rect.top}px`);
  }

  const showLabels = mobileOpen || !collapsed;
  const width = showLabels ? 'w-60' : 'w-[4.5rem]';
  const mobile = mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0';

  return (
    <nav
      aria-label="Areas"
      data-sheen={sheen ? 'on' : 'off'}
      onMouseMove={moveSheen}
      className={`platform-rail glass-chrome fixed bottom-0 left-0 top-0 z-30 flex flex-col px-2 py-4 transition-transform md:static ${width} ${mobile}`}
    >
      <p className={`px-2 pb-4 text-xs uppercase tracking-[0.16em] text-ink-faint ${showLabels ? '' : 'sr-only'}`}>
        Black Tier Circle
      </p>
      <ul className="flex flex-1 flex-col gap-1">
        {PLATFORM_AREAS.map((area) => {
          const active = pathname === area.href || pathname.startsWith(`${area.href}/`);
          return (
            <li key={area.href}>
              <Link
                href={area.href}
                aria-current={active ? 'page' : undefined}
                title={area.label}
                onClick={onNavigate}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${
                  active ? 'bg-[var(--brand-tint)] text-ink' : 'text-ink-soft hover:bg-raised hover:text-ink'
                }`}
              >
                <span aria-hidden="true" className="grid h-5 w-5 place-items-center text-xs font-num text-crimson">
                  {area.label.slice(0, 1)}
                </span>
                <span className={showLabels ? '' : 'sr-only'}>{area.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
