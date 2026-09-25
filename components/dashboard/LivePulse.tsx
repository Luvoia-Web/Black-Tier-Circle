'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BalanceChart } from '@/components/wallet/BalanceChart';

type PulseRow = {
  readonly id: string;
  readonly title: string;
  readonly amount: number;
  readonly createdAt: string;
};

type LivePulseProps = {
  readonly href: string;
  readonly title: string;
};

/**
 * Polls an orders endpoint and draws a 7-day revenue line from the response.
 */
export function LivePulse({ href, title }: LivePulseProps): JSX.Element {
  const [rows, setRows] = useState<PulseRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const response = await fetch(href);
      const json = (await response.json()) as {
        success?: boolean;
        data?: { rows?: Array<Record<string, unknown>> };
      };
      if (!json.success || !json.data?.rows || cancelled) {
        return;
      }
      const next = json.data.rows.slice(0, 8).map((row) => ({
        id: String(row.orderId ?? row.id ?? ''),
        title: String(row.productTitle ?? 'Order'),
        amount: Number(row.totalMinor ?? 0) / 1_000_000 || Number(String(row.amount ?? '0').replace(/[^\d.]/g, '')) || 0,
        createdAt: String(row.createdAt ?? ''),
      }));
      setRows(next.filter((row) => row.id.length > 0));
    }
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [href]);

  const byDay = new Map<string, number>();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - offset);
    byDay.set(day.toISOString().slice(0, 10), 0);
  }
  for (const row of rows) {
    const key = row.createdAt.slice(0, 10);
    if (byDay.has(key)) {
      byDay.set(key, (byDay.get(key) ?? 0) + row.amount);
    }
  }

  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="text-sm font-semibold text-[var(--text-1)]">{title}</h2>
      <div className="mt-3">
        <BalanceChart points={[...byDay.values()]} />
      </div>
      <ul className="mt-3 space-y-2">
        <AnimatePresence initial={false}>
          {rows.map((row) => (
            <motion.li
              key={row.id}
              layout
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex justify-between text-sm"
            >
              <span className="text-[var(--text-1)]">{row.title}</span>
              <span className="text-[var(--text-2)]">{row.amount.toFixed(2)} USDT</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
