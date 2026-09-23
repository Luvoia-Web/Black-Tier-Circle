/**
 * @file components/ui/CommandPalette.tsx
 *
 * Cmd/Ctrl+K page jump palette.
 *
 * @module Components
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/navigation';
import type { UserRole } from '@/modules/identity/types';

type Command = {
  readonly label: string;
  readonly href: string;
};

const OWNER_COMMANDS: ReadonlyArray<Command> = [
  { label: 'Dashboard', href: ROUTES.owner.home },
  { label: 'Orders', href: ROUTES.owner.orders },
  { label: 'Products', href: ROUTES.owner.products },
  { label: 'New product', href: ROUTES.owner.productNew },
  { label: 'Resellers', href: ROUTES.owner.resellers },
  { label: 'Invite reseller', href: ROUTES.owner.resellersInvite },
  { label: 'Wallets', href: ROUTES.owner.wallets },
  { label: 'Payments', href: ROUTES.owner.payments },
  { label: 'Tokens', href: ROUTES.owner.tokens },
  { label: 'Settings', href: ROUTES.owner.settings },
  { label: 'Launch', href: ROUTES.owner.launch },
];

const RESELLER_COMMANDS: ReadonlyArray<Command> = [
  { label: 'Dashboard', href: ROUTES.reseller.home },
  { label: 'Orders', href: ROUTES.reseller.orders },
  { label: 'My Store', href: ROUTES.reseller.products },
  { label: 'Wallet & Deposits', href: ROUTES.reseller.deposits },
  { label: 'My Bot', href: ROUTES.reseller.bot },
  { label: 'Settings', href: ROUTES.reseller.settings },
];

export function CommandPalette({ role }: { readonly role: UserRole }): JSX.Element | null {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const commands = role === 'owner' ? OWNER_COMMANDS : RESELLER_COMMANDS;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return commands;
    }
    return commands.filter((item) => item.label.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
        setQuery('');
        setActive(0);
      }
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    function onOpen(): void {
      setOpen(true);
      setQuery('');
      setActive(0);
    }
    window.addEventListener('btc:command', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('btc:command', onOpen);
    };
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 p-4 pt-[12vh]">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl">
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((current) => Math.min(filtered.length - 1, current + 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((current) => Math.max(0, current - 1));
            }
            if (event.key === 'Enter') {
              const item = filtered[active];
              if (item) {
                setOpen(false);
                router.push(item.href);
              }
            }
          }}
          placeholder="Jump to a page…"
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-sm text-[var(--text-1)] outline-none"
          aria-label="Command search"
        />
        <ul className="max-h-72 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--text-3)]">No matches</li>
          ) : (
            filtered.map((item, index) => (
              <li key={item.href}>
                <button
                  type="button"
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    index === active ? 'bg-[var(--bg-raised)] text-[var(--text-1)]' : 'text-[var(--text-2)]'
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-[var(--border)] px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
          Enter to open · Esc to close
        </p>
      </div>
    </div>
  );
}
