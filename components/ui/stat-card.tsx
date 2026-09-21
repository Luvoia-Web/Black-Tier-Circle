/**
 * @file components/ui/stat-card.tsx
 *
 * Dashboard statistic card with label, value, optional trend, icon, and chart.
 *
 * @module Components
 */

import type { ReactNode } from 'react';

type StatCardProps = {
  readonly label: string;
  readonly value: string;
  readonly trend?: string;
  readonly trendPositive?: boolean;
  readonly icon?: ReactNode;
  readonly chart?: ReactNode;
};

/**
 * Renders a metric card matching the Sweatpals-style dashboard tiles.
 *
 * @param props - Label, value, and optional trend/icon/chart
 */
export function StatCard({
  label,
  value,
  trend,
  trendPositive,
  icon,
  chart,
}: StatCardProps): JSX.Element {
  const trendColor =
    trendPositive === undefined
      ? 'text-[var(--text-2)]'
      : trendPositive
        ? 'text-[var(--green)]'
        : 'text-[var(--red)]';

  return (
    <article className="relative rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
      {icon ? <div className="absolute right-4 top-4 text-[var(--text-3)]">{icon}</div> : null}
      <p className="pr-8 text-2xl font-bold tracking-tight text-[var(--text-1)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--text-2)]">{label}</p>
      {trend ? <p className={`mt-1 text-xs ${trendColor}`}>{trend}</p> : null}
      {chart ? <div className="mt-3">{chart}</div> : null}
    </article>
  );
}

export default StatCard;
