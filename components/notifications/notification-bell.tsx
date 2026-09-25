/**
 * @file components/notifications/notification-bell.tsx
 *
 * Header bell with an unread count and a filterable dropdown.
 *
 * @module Components
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { LottiePlayer } from '@/components/motion/LottiePlayer';
import { SCALE_IN } from '@/lib/animations';
import type { NotificationItem } from '@/modules/notifications';
import type { UserRole } from '@/modules/identity/types';

type NotificationBellProps = {
  readonly role: UserRole;
};

const TABS = ['all', 'unread', 'orders', 'wallet', 'system'] as const;

function destinationFor(item: NotificationItem, role: UserRole): string {
  if (item.type.startsWith('order_') && typeof item.metadata.orderId === 'string') {
    return role === 'owner' ? `/owner/orders/${item.metadata.orderId}` : `/reseller/orders/${item.metadata.orderId}`;
  }
  if (item.type.startsWith('wallet_') || item.type === 'balance_low') {
    return role === 'owner' ? '/owner/wallets' : '/reseller/wallet';
  }
  if (item.type === 'product_added') {
    return role === 'owner' ? '/owner/products' : '/reseller/products';
  }
  return role === 'owner' ? '/owner' : '/reseller';
}

function relative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(delta / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Polls unread notifications every 30 seconds.
 */
export function NotificationBell({ role }: NotificationBellProps): JSX.Element {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async (): Promise<void> => {
    const response = await fetch(`/api/notifications?filter=${tab}`);
    const json = (await response.json()) as { success?: boolean; data?: { items?: NotificationItem[]; unread?: number } };
    if (json.success && json.data) {
      setItems(json.data.items ?? []);
      setUnread(json.data.unread ?? 0);
    }
  }, [tab]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    function onDoc(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function markAll(): Promise<void> {
    await fetch('/api/notifications/read-all', { method: 'PATCH' });
    await load();
  }

  async function openItem(item: NotificationItem): Promise<void> {
    await fetch(`/api/notifications/${item.id}/read`, { method: 'PATCH' });
    setOpen(false);
    router.push(destinationFor(item, role));
  }

  const badge = unread > 99 ? '99+' : String(unread);
  const inbox = role === 'owner' ? '/owner/notifications' : '/reseller/notifications';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${badge} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-raised)] text-[var(--text-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-1)]"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 ? (
          <motion.span
            key={badge}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--red)] px-1 text-[10px] text-white"
          >
            {badge}
          </motion.span>
        ) : null}
      </button>
      <AnimatePresence>
      {open ? (
        <motion.div
          className="notification-panel"
          role="dialog"
          aria-label="Notifications"
          initial={SCALE_IN.initial}
          animate={SCALE_IN.animate}
          exit={SCALE_IN.exit}
          transition={SCALE_IN.transition}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold text-[var(--text-1)]">Notifications</p>
            <button type="button" className="min-h-11 text-xs text-[var(--accent-soft)]" onClick={() => void markAll()}>
              Mark all as read
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2" role="tablist">
            {TABS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                className={`min-h-11 rounded-full px-3 text-xs capitalize ${tab === item ? 'bg-[var(--bg-raised)] text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}
                onClick={() => setTab(item)}
              >
                {item === 'unread' ? `Unread (${unread})` : item}
              </button>
            ))}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center">
                <LottiePlayer name="empty-box" className="mx-auto h-16 w-16" />
                <p className="mt-2 text-sm text-[var(--text-1)]">No notifications yet</p>
                <p className="text-xs text-[var(--text-3)]">You&apos;ll see order updates, wallet changes, and more here</p>
              </li>
            ) : (
              items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`flex w-full min-h-11 flex-col px-4 py-3 text-left ${item.isRead ? '' : 'border-l-2 border-[var(--accent)] bg-[var(--bg-raised)]'}`}
                    onClick={() => void openItem(item)}
                  >
                    <span className="flex justify-between gap-2 text-sm text-[var(--text-1)]">
                      <span>{item.title}</span>
                      <span className="text-xs text-[var(--text-3)]">{relative(item.createdAt)}</span>
                    </span>
                    <span className="text-xs text-[var(--text-2)]">{item.body}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <a className="block border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--accent-soft)]" href={inbox}>
            View all notifications
          </a>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </div>
  );
}
