/**
 * Reseller intelligence center: store learning, recovery, and a session activity feed.
 */

'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CommerceRecoveryPanel } from '@/components/intelligence/CommerceRecoveryPanel';
import { CustomerIntelligencePanel } from '@/components/intelligence/CustomerIntelligencePanel';
import { StoreIntelligencePanel } from '@/components/intelligence/StoreIntelligencePanel';
import { DEMO_CUSTOMER_ID, DEMO_TENANT_ID } from '@/lib/intelligence-demo';
import { API_ROUTES } from '@/lib/navigation';

type Buyer = {
  readonly id: string;
  readonly buyer: string;
};

type FeedItem = {
  readonly id: string;
  readonly tone: 'violet' | 'blue' | 'orange';
  readonly text: string;
  readonly time: string;
};

const SEED: ReadonlyArray<FeedItem> = [
  { id: 'a1', tone: 'violet', text: '3 new patterns promoted from customer memory', time: 'just now' },
  { id: 'a2', tone: 'blue', text: 'Customer preference recalled before the reply', time: '4 min ago' },
  { id: 'a3', tone: 'orange', text: 'Recovery pattern saved for a payment dispute', time: '18 min ago' },
];

type IntelligenceBoardProps = {
  readonly tenantId: string;
};

type TabId = 'store' | 'recovery' | 'feed';

export function IntelligenceBoard({ tenantId }: IntelligenceBoardProps): JSX.Element {
  const [customers, setCustomers] = useState<readonly Buyer[]>([]);
  const [customerId, setCustomerId] = useState(DEMO_CUSTOMER_ID);
  const [tab, setTab] = useState<TabId>('store');
  const [feed, setFeed] = useState<readonly FeedItem[]>(SEED);

  useEffect(() => {
    void fetch(API_ROUTES.resellerCustomers)
      .then(async (response) => response.json() as Promise<{ success?: boolean; data?: { rows?: Buyer[] } }>)
      .then((json) => {
        if (json.success && json.data?.rows) {
          setCustomers(json.data.rows);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function onActivity(event: Event): void {
      const detail = (event as CustomEvent<{ text?: string; tone?: FeedItem['tone'] }>).detail;
      const text = detail?.text;
      if (!text) return;
      const item: FeedItem = {
        id: `${Date.now()}`,
        tone: detail.tone ?? 'violet',
        text,
        time: 'just now',
      };
      setFeed((current) => [item, ...current].slice(0, 12));
    }
    window.addEventListener('btc:memory-activity', onActivity);
    return () => window.removeEventListener('btc:memory-activity', onActivity);
  }, []);

  const selected = customers.find((customer) => customer.id === customerId);
  const storeTenant = customerId === DEMO_CUSTOMER_ID ? DEMO_TENANT_ID : tenantId;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)]">MemoryOS</p>
          <h1 className="mt-1 bg-[image:var(--grad-memory)] bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
            Intelligence Center
          </h1>
        </div>
        <span className="rounded-full border border-[var(--border-glow)] bg-[var(--surface-2)] px-3 py-1 text-xs text-[var(--text-1)]">
          Powered by Hindsight
        </span>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Intelligence">
        {(
          [
            ['store', 'Store Intelligence'],
            ['recovery', 'Commerce Recovery'],
            ['feed', 'Activity Feed'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-11 rounded-full px-4 text-sm ${
              tab === id ? 'bg-[image:var(--grad-primary)] text-white' : 'border border-[var(--border-soft)] text-[var(--text-1)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-2)]">
        Customer
        <select
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          className="btc-select"
          aria-label="Customer"
        >
          <option value={DEMO_CUSTOMER_ID}>Demo customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.buyer}
            </option>
          ))}
        </select>
      </label>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'store' ? (
            <div className="space-y-8">
              <CustomerIntelligencePanel
                customerId={customerId}
                tenantId={storeTenant}
                {...(selected ? { customerName: selected.buyer } : { customerName: 'Demo customer' })}
              />
              <StoreIntelligencePanel tenantId={storeTenant} />
            </div>
          ) : null}
          {tab === 'recovery' ? <CommerceRecoveryPanel tenantId={storeTenant} /> : null}
          {tab === 'feed' ? (
            <ul className="space-y-2">
              {feed.map((item) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-3"
                >
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: item.tone === 'orange' ? 'var(--commerce)' : item.tone === 'blue' ? 'var(--plasma)' : 'var(--memory)' }}
                  />
                  <div>
                    <p className="text-sm text-[var(--text-0)]">{item.text}</p>
                    <p className="text-xs text-[var(--text-3)]">{item.time}</p>
                  </div>
                </motion.li>
              ))}
            </ul>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
