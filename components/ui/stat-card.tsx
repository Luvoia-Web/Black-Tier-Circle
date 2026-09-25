'use client';

import type { ReactNode } from 'react';
import { AnimatedCounter } from '@/components/motion/AnimatedCounter';
import { GlowCard } from '@/components/motion/GlowCard';

type StatCardProps = {
  readonly label: string;
  readonly value: string;
  readonly trend?: string;
  readonly trendPositive?: boolean;
  readonly icon?: ReactNode;
  readonly chart?: ReactNode;
  readonly delay?: number;
};

/**
 * Metric tile with a cursor spotlight and a count-up when the value is numeric.
 */
export function StatCard({
  label,
  value,
  trend,
  trendPositive,
  icon,
  chart,
  delay = 0,
}: StatCardProps): JSX.Element {
  const trendColor =
    trendPositive === undefined
      ? 'text-[var(--text-2)]'
      : trendPositive
        ? 'text-[var(--green)]'
        : 'text-[var(--red)]';
  const parsed = parseStatValue(value);

  return (
    <GlowCard
      delay={delay}
      className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-[var(--text-2)]">{label}</p>
        {icon ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-glow)] text-[var(--accent-soft)]">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-1)]">
        {parsed ? (
          <AnimatedCounter value={parsed.num} prefix={parsed.prefix} suffix={parsed.suffix} decimals={parsed.decimals} />
        ) : (
          value
        )}
      </p>
      {trend ? <p className={`mt-1 text-xs ${trendColor}`}>{trend}</p> : null}
      {chart ? <div className="mt-3">{chart}</div> : null}
    </GlowCard>
  );
}

function parseStatValue(value: string): { num: number; prefix: string; suffix: string; decimals: number } | null {
  const match = /^([^0-9-]*)(-?\d+(?:\.\d+)?)(.*)$/.exec(value.trim());
  if (match === null) {
    return null;
  }
  const raw = match[2];
  if (raw === undefined) {
    return null;
  }
  const decimals = raw.includes('.') ? (raw.split('.')[1]?.length ?? 0) : 0;
  return { prefix: match[1] ?? '', num: Number(raw), suffix: match[3] ?? '', decimals };
}

export default StatCard;
