'use client';

/**
 * Floating glass sidebar. The active pill is one layer, clipped to the current
 * item. The leading edge moves first so the pill stretches, then the trailing
 * edge catches up. Reduced motion jumps.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Crown, PanelLeft } from 'lucide-react';
import { EMPTY_COUNTS, navGroupsFor, type NavBadge, type NavCounts } from '@/components/platform/nav';
import type { UserRole } from '@/modules/identity/types';

type SidebarProps = {
  readonly role: UserRole;
  readonly collapsed: boolean;
  readonly mobileOpen: boolean;
  readonly onNavigate: () => void;
  readonly onToggleCollapsed: () => void;
  readonly counts: NavCounts;
};

type Insets = { top: number; right: number; bottom: number; left: number };

function samePath(href: string, pathname: string, search: string): boolean {
  const [path, query = ''] = href.split('?');
  if (pathname !== path) return false;
  const current = new URLSearchParams(search);
  if (!query) {
    if (path === '/catalog') {
      const section = current.get('section');
      return section === null || section === '' || section === 'catalogue';
    }
    if (path === '/growth') {
      const section = current.get('section');
      return section !== 'discounts' && section !== 'broadcasts';
    }
    if (path === '/money') {
      return current.get('section') !== 'payments';
    }
    if (path === '/store') {
      return current.get('section') !== 'bots';
    }
    return true;
  }
  const wanted = new URLSearchParams(query);
  for (const [key, value] of wanted.entries()) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

function badgeValue(badge: NavBadge | undefined, counts: NavCounts): number {
  if (badge === 'orders') return counts.orders;
  if (badge === 'support') return counts.support;
  if (badge === 'resellers') return counts.resellers;
  return 0;
}

function clip(insets: Insets): string {
  return `inset(${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px round 12px)`;
}

export function PlatformSidebar({
  role,
  collapsed,
  mobileOpen,
  onNavigate,
  onToggleCollapsed,
  counts,
}: SidebarProps): JSX.Element {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const listRef = useRef<HTMLUListElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const previous = useRef<Insets | null>(null);
  const showLabels = mobileOpen || !collapsed;
  const groups = navGroupsFor(role);
  const [goal, setGoal] = useState(1600);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalNeedsMigration, setGoalNeedsMigration] = useState(false);

  useEffect(() => {
    let gone = false;
    async function load(): Promise<void> {
      try {
        const response = await fetch('/api/platform/goal');
        const payload = (await response.json()) as { success?: boolean; data?: { goalUsdt?: string | null; needsMigration?: boolean } };
        if (gone || !payload.success || !payload.data) return;
        if (payload.data.needsMigration) {
          setGoalNeedsMigration(true);
          const stored = window.localStorage.getItem('btc-revenue-goal');
          const parsed = stored ? Number(stored) : 1600;
          if (Number.isFinite(parsed) && parsed >= 0) setGoal(parsed);
          return;
        }
        setGoalNeedsMigration(false);
        const parsed = payload.data.goalUsdt ? Number(payload.data.goalUsdt) : 1600;
        if (Number.isFinite(parsed) && parsed >= 0) setGoal(parsed);
      } catch {
        // The ring keeps the last goal.
      }
    }
    void load();
    return () => {
      gone = true;
    };
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    const pill = pillRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !pill || !active) return;
    const listBox = list.getBoundingClientRect();
    const itemBox = active.getBoundingClientRect();
    const top = itemBox.top - listBox.top + list.scrollTop;
    const left = itemBox.left - listBox.left;
    const next: Insets = {
      top,
      left,
      right: Math.max(0, listBox.width - left - itemBox.width),
      bottom: Math.max(0, list.scrollHeight - top - itemBox.height),
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = previous.current;
    previous.current = next;
    if (!from || reduced) {
      gsap.set(pill, { clipPath: clip(next) });
      return;
    }
    const vertical = Math.abs(next.top - from.top) >= Math.abs(next.left - from.left);
    const proxy = { ...from };
    const timeline = gsap.timeline({
      onUpdate: () => {
        pill.style.clipPath = clip(proxy);
      },
    });
    (['top', 'right', 'bottom', 'left'] as const).forEach((key) => {
      const leading = next[key] < from[key] - 0.5;
      const cross = vertical ? key === 'left' || key === 'right' : key === 'top' || key === 'bottom';
      timeline.to(
        proxy,
        {
          [key]: next[key],
          duration: cross ? 0.45 : leading ? 0.36 : 0.55,
          ease: cross || !leading ? 'power3.inOut' : 'power3.out',
        },
        0,
      );
    });
    return () => {
      timeline.kill();
    };
  }, [pathname, search, showLabels, role]);

  const revenue = Number(BigInt(counts.revenueMinor || '0')) / 1_000_000;
  const progress = goal > 0 ? Math.max(0, Math.min(1, revenue / goal)) : 0;
  const ring = 2 * Math.PI * 18;

  return (
    <aside
      className={`glass-sidebar fixed bottom-3 left-3 top-3 z-30 flex h-[calc(100dvh-1.5rem)] w-[min(100%-1.5rem,256px)] flex-col rounded-xl p-3 transition-transform ${
        showLabels ? 'md:w-sidebar' : 'md:w-rail'
      } ${mobileOpen ? 'translate-x-0' : '-translate-x-[120%] md:translate-x-0'}`}
    >
      <div className="flex items-center gap-2 px-1 pb-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose/20 text-rose">
          <Crown className="h-4 w-4" aria-hidden="true" />
        </span>
        {showLabels ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">Black Tier Circle</span>
            <span className="block truncate text-xs text-ink-faint">{role === 'owner' ? 'Owner workspace' : 'Your store'}</span>
          </span>
        ) : null}
        <button
          type="button"
          className="ml-auto hidden h-8 w-8 place-items-center rounded-md text-ink-soft hover:bg-white/5 md:grid"
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleCollapsed}
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <nav aria-label="Workspace" className="min-h-0 flex-1 overflow-y-auto">
        <ul ref={listRef} className="relative flex flex-col gap-4">
          <span ref={pillRef} aria-hidden="true" className="pointer-events-none absolute inset-0 bg-rose/15" />
          {groups.map((group) => (
            <li key={group.id}>
              <p className={`px-2 pb-1 text-[11px] uppercase tracking-[0.14em] text-ink-faint ${showLabels ? '' : 'sr-only'}`}>{group.label}</p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const childActive = item.children?.some((child) => samePath(child.href, pathname, search)) ?? false;
                  const active = childActive || samePath(item.href, pathname, search);
                  const count = badgeValue(item.badge, counts);
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        title={item.label}
                        onClick={onNavigate}
                        className="relative z-10 flex min-h-10 items-center gap-2 rounded-md px-2 text-sm text-ink-soft hover:text-ink"
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className={`min-w-0 flex-1 truncate ${showLabels ? '' : 'sr-only'}`}>{item.label}</span>
                        {showLabels && count > 0 ? (
                          <span className="rounded-pill bg-rose px-1.5 text-[11px] font-medium tabular-nums text-white">{count}</span>
                        ) : null}
                      </Link>
                      {showLabels && item.children && (active || childActive) ? (
                        <ul className="ml-6 mt-0.5 flex flex-col">
                          {item.children.map((child) => {
                            const current = samePath(child.href, pathname, search);
                            return (
                              <li key={child.id}>
                                <Link
                                  href={child.href}
                                  aria-current={current ? 'true' : undefined}
                                  onClick={onNavigate}
                                  className={`relative z-10 flex min-h-8 items-center gap-2 rounded-md px-2 text-[12.5px] hover:text-ink ${current ? 'text-ink' : 'text-white/60'}`}
                                >
                                  <span className={`h-1 w-1 rounded-full ${current ? 'bg-rose' : 'bg-white/40'}`} aria-hidden="true" />
                                  {child.label}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-3 flex items-center gap-3 rounded-lg bg-black/20 px-2 py-2">
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="18" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="rgb(var(--c-rose))"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${ring} ${ring}`}
            strokeDashoffset={ring * (1 - progress)}
            transform="rotate(-90 22 22)"
          />
        </svg>
        {showLabels ? (
          <div className="min-w-0">
            <p className="truncate text-sm tabular-nums text-ink">{revenue.toFixed(0)} USDT today</p>
            {editingGoal ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = Number.isFinite(goal) && goal >= 0 ? goal.toFixed(6).replace(/\.?0+$/, '') || '0' : '';
                  if (goalNeedsMigration) {
                    window.localStorage.setItem('btc-revenue-goal', text);
                    setEditingGoal(false);
                    return;
                  }
                  void fetch('/api/platform/goal', {
                    method: 'PUT',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ goal: text }),
                  })
                    .then(async (response) => {
                      const payload = (await response.json()) as { success?: boolean; data?: { needsMigration?: boolean; goalUsdt?: string | null } };
                      if (payload.data?.needsMigration) {
                        setGoalNeedsMigration(true);
                        window.localStorage.setItem('btc-revenue-goal', text);
                      }
                      if (payload.success && payload.data?.goalUsdt) {
                        setGoal(Number(payload.data.goalUsdt));
                      }
                      setEditingGoal(false);
                    })
                    .catch(() => setEditingGoal(false));
                }}
              >
                <label className="text-xs text-ink-faint" htmlFor="today-goal">
                  Goal in USDT
                  <input
                    id="today-goal"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-md border border-stroke bg-transparent px-2 py-1 text-xs text-ink"
                    value={goal}
                    onChange={(event) => setGoal(Number(event.target.value) || 0)}
                  />
                </label>
              </form>
            ) : (
              <button type="button" className="text-xs text-ink-faint" onClick={() => setEditingGoal(true)}>
                {Math.round(progress * 100)}% of a {goal.toLocaleString('en-US')} USDT goal
              </button>
            )}
            {goalNeedsMigration ? <p className="text-xs text-ink-faint">needs migration 0033</p> : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export function useNavCounts(): NavCounts {
  const [counts, setCounts] = useState<NavCounts>(EMPTY_COUNTS);
  useEffect(() => {
    let gone = false;
    async function load(): Promise<void> {
      try {
        const response = await fetch('/api/platform/nav');
        const payload = (await response.json()) as { success?: boolean; data?: NavCounts };
        if (!gone && payload.success && payload.data) setCounts(payload.data);
      } catch {
        // The shell keeps the last counts.
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      gone = true;
      window.clearInterval(timer);
    };
  }, []);
  return counts;
}
