/**
 * @file components/platform/command-palette.tsx
 *
 * Cmd+K and Ctrl+K. Jump to an area, search products, orders, and customers,
 * or run sync and publish. Fully keyboard operable.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { PLATFORM_AREAS, SELECTION_STORAGE_KEY } from '@/components/platform/areas';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { UserRole } from '@/modules/identity/types';

type Hit = {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly hint: string;
  readonly href?: string;
  readonly run?: () => void;
};

type CommandPaletteProps = {
  readonly role: UserRole;
  readonly open: boolean;
  readonly onClose: () => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rowsOf(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload) || payload.success !== true) {
    return [];
  }
  const data = payload.data;
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }
  if (!isRecord(data)) {
    return [];
  }
  const list = Array.isArray(data.rows) ? data.rows : Array.isArray(data.products) ? data.products : [];
  return list.filter(isRecord);
}

export function CommandPalette({ role, open, onClose }: CommandPaletteProps): JSX.Element | null {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Hit[]>([]);
  const [status, setStatus] = useState('');
  const [active, setActive] = useState(0);

  const areas = useMemo<Hit[]>(() => {
    const needle = query.trim().toLowerCase();
    return PLATFORM_AREAS.filter((area) => !needle || area.label.toLowerCase().includes(needle) || area.description.toLowerCase().includes(needle)).map(
      (area) => ({
        id: `area-${area.href}`,
        group: 'Areas',
        label: area.label,
        hint: area.description,
        href: area.href,
      }),
    );
  }, [query]);

  const actions = useMemo<Hit[]>(() => {
    if (role !== 'owner') {
      return [];
    }
    const needle = query.trim().toLowerCase();
    const all: Hit[] = [
      {
        id: 'sync',
        group: 'Actions',
        label: 'Sync suppliers',
        hint: 'Pull the latest catalog from every connected supplier',
        run: () => {
          void runSync(setStatus);
        },
      },
      {
        id: 'publish',
        group: 'Actions',
        label: 'Publish selected',
        hint: 'Publish the rows selected in Catalog',
        run: () => {
          void runPublish(setStatus);
        },
      },
    ];
    return all.filter((hit) => !needle || hit.label.toLowerCase().includes(needle));
  }, [query, role]);

  const hits = [...areas, ...actions, ...remote];

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    setRemote([]);
    setStatus('');
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const needle = query.trim();
    if (needle.length < 2) {
      setRemote([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void search(role, needle, controller.signal)
        .then((found) => {
          if (!controller.signal.aborted) {
            setRemote(found);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setStatus('Search failed. Check the connection and try again.');
          }
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, role]);

  useEffect(() => {
    setActive(0);
  }, [query, remote.length]);

  if (!open) {
    return null;
  }

  function choose(hit: Hit | undefined): void {
    if (!hit) {
      return;
    }
    if (hit.href) {
      router.push(hit.href);
      onClose();
      return;
    }
    hit.run?.();
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (hits.length === 0 ? 0 : (current + 1) % hits.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (hits.length === 0 ? 0 : (current - 1 + hits.length) % hits.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(hits[active]);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKey}>
      <button type="button" aria-label="Close command palette" className="absolute inset-0 bg-[color-mix(in_srgb,var(--base)_62%,transparent)]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="relative z-10 w-full max-w-xl rounded-lg border border-stroke bg-raised">
        <input
          ref={inputRef}
          value={query}
          aria-controls={listId}
          aria-activedescendant={hits[active] ? `${listId}-${hits[active]?.id}` : undefined}
          placeholder="Jump, search, or run an action"
          className="w-full border-b border-stroke bg-transparent px-4 py-3 text-sm text-ink outline-none"
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul id={listId} role="listbox" className="max-h-80 overflow-y-auto py-2">
          {hits.length === 0 ? <li className="px-4 py-3 text-sm text-ink-soft">No matches.</li> : null}
          {hits.map((hit, index) => (
            <li key={hit.id} id={`${listId}-${hit.id}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`flex w-full min-h-11 items-center justify-between gap-3 px-4 text-left text-sm ${index === active ? 'bg-[var(--brand-tint)] text-ink' : 'text-ink-soft'}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(hit)}
              >
                <span>
                  <span className="block text-ink">{hit.label}</span>
                  <span className="block text-xs text-ink-faint">{hit.hint}</span>
                </span>
                <span className="text-xs uppercase tracking-[0.12em] text-ink-faint">{hit.group}</span>
              </button>
            </li>
          ))}
        </ul>
        {status ? <p className="border-t border-stroke px-4 py-3 text-sm text-ink">{status}</p> : null}
      </div>
    </div>
  );
}

async function search(role: UserRole, needle: string, signal: AbortSignal): Promise<Hit[]> {
  const encoded = encodeURIComponent(needle);
  const ordersUrl = role === 'owner' ? `${API_ROUTES.ownerOrders}?q=${encoded}&limit=8` : `${API_ROUTES.resellerOrders}?q=${encoded}&pageSize=8`;
  const productUrl = role === 'owner' ? `${API_ROUTES.products}?search=${encoded}&limit=8` : API_ROUTES.resellerCatalog;
  const calls: Array<Promise<Hit[]>> = [
    readHits(productUrl, signal, 'Products', (row) => ({
      id: `product-${text(row.id)}`,
      group: 'Products',
      label: text(row.title) || text(row.id),
      hint: text(row.sku) || text(row.id),
      href: `${ROUTES.platform.catalog}?item=${encodeURIComponent(text(row.id))}`,
    })),
    readHits(ordersUrl, signal, 'Orders', (row) => ({
      id: `order-${text(row.orderId)}`,
      group: 'Orders',
      label: text(row.productTitle) || text(row.orderId).slice(0, 8),
      hint: text(row.orderId),
      href: `${ROUTES.platform.orders}?order=${encodeURIComponent(text(row.orderId))}`,
    })),
  ];
  if (role !== 'owner') {
    calls.push(
      readHits(`${API_ROUTES.resellerCustomers}?q=${encoded}`, signal, 'Customers', (row) => ({
        id: `person-${text(row.id)}`,
        group: 'Customers',
        label: text(row.buyer) || text(row.id),
        hint: text(row.id),
        href: `${ROUTES.platform.people}?person=${encodeURIComponent(text(row.id))}`,
      })),
    );
  }
  const groups = await Promise.all(calls);
  const flat = groups.flat().filter((hit) => hit.label.length > 0);
  if (role === 'owner') {
    return flat.slice(0, 24);
  }
  const needleLower = needle.toLowerCase();
  return flat
    .filter((hit) => hit.group !== 'Products' || hit.label.toLowerCase().includes(needleLower) || hit.hint.toLowerCase().includes(needleLower))
    .slice(0, 24);
}

async function readHits(
  url: string,
  signal: AbortSignal,
  group: string,
  map: (row: Record<string, unknown>) => Hit,
): Promise<Hit[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    return [{ id: `${group}-error`, group, label: `${group} search failed`, hint: 'Try again in a moment' }];
  }
  const payload: unknown = await response.json();
  return rowsOf(payload).slice(0, 8).map(map);
}

async function runSync(setStatus: (message: string) => void): Promise<void> {
  setStatus('Syncing suppliers…');
  try {
    const response = await fetch(API_ROUTES.supplierSync, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isRecord(payload) || payload.success !== true) {
      setStatus('Sync did not finish. Open Catalog and try again from there.');
      return;
    }
    setStatus('Supplier sync finished.');
  } catch {
    setStatus('Sync did not finish. Check the connection and try again.');
  }
}

async function runPublish(setStatus: (message: string) => void): Promise<void> {
  const raw = window.sessionStorage.getItem(SELECTION_STORAGE_KEY);
  const ids = raw ? raw.split(',').map((id) => id.trim()).filter(Boolean) : [];
  if (ids.length === 0) {
    setStatus('Select rows in Catalog first. Nothing was published.');
    return;
  }
  setStatus(`Publishing ${ids.length} selected…`);
  try {
    const response = await fetch(API_ROUTES.supplierBulkPublish, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supplierProductIds: ids.slice(0, 200) }),
    });
    if (!response.ok) {
      setStatus('Publish failed. The selection was kept.');
      return;
    }
    setStatus('Publish finished. Open Catalog to see the new stages.');
  } catch {
    setStatus('Publish failed. The selection was kept.');
  }
}
