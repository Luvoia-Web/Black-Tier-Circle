/**
 * @file components/platform/drawer.tsx
 *
 * Right-hand detail drawer. The URL is the source of truth, so a row can be
 * linked and refreshed into. Escape closes it and focus returns to the opener.
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { DRAWER_PARAMS, type DrawerParam } from '@/components/platform/areas';

const LABELS: Record<DrawerParam, string> = {
  order: 'Order',
  item: 'Catalog item',
  person: 'Person',
  wallet: 'Wallet',
  thread: 'Support thread',
};

function activeDrawer(params: URLSearchParams): { key: DrawerParam; id: string } | null {
  for (const key of DRAWER_PARAMS) {
    const id = params.get(key);
    if (id) {
      return { key, id };
    }
  }
  return null;
}

export function PlatformDrawer({ children }: { readonly children?: ReactNode }): JSX.Element | null {
  const params = useSearchParams();
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = activeDrawer(params);

  useEffect(() => {
    if (!open) {
      return;
    }
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const closeButton = panel?.querySelector<HTMLElement>('[data-drawer-close]');
    closeButton?.focus();

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panel) {
        return;
      }
      const focusable = [...panel.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
        (node) => !node.hasAttribute('disabled'),
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener.current?.focus();
    };
    // close is stable enough for the life of an open drawer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.key, open?.id]);

  function close(): void {
    const next = new URLSearchParams(params.toString());
    for (const key of DRAWER_PARAMS) {
      next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `?${query}` : window.location.pathname, { scroll: false });
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close detail" className="absolute inset-0 bg-[color-mix(in_srgb,var(--base)_55%,transparent)]" onClick={close} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-drawer-title"
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-stroke bg-raised"
      >
        <header className="flex items-center justify-between gap-3 border-b border-stroke px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-ink-faint">{LABELS[open.key]}</p>
            <h2 id="platform-drawer-title" className="font-num text-sm text-ink">
              {open.id}
            </h2>
          </div>
          <button type="button" data-drawer-close className="min-h-11 rounded-md px-3 text-sm text-ink" onClick={close}>
            Close
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 text-sm text-ink-soft">
          {children ?? <p>The list stays where you left it. This record’s full detail loads in its area.</p>}
        </div>
      </aside>
    </div>
  );
}
