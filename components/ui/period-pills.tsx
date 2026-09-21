/**
 * @file components/ui/period-pills.tsx
 *
 * Today / Yesterday / Week / Month / Lifetime filter chips.
 *
 * @module Components
 */

'use client';

import type { DashboardPeriod } from '@/lib/period';

export const PERIOD_OPTIONS: ReadonlyArray<{ readonly id: DashboardPeriod; readonly label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'lifetime', label: 'Lifetime' },
];

type PeriodPillsProps = {
  readonly value: DashboardPeriod;
  readonly onChange: (period: DashboardPeriod) => void;
};

/**
 * Renders the dashboard period filter as rounded pills.
 *
 * @param props - Selected period and change handler
 */
export function PeriodPills({ value, onChange }: PeriodPillsProps): JSX.Element {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {PERIOD_OPTIONS.map((item) => {
        const isActive = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`inline-flex rounded-full px-3 py-1 text-xs ${
              isActive
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-2)] hover:bg-[var(--bg-raised)]'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export default PeriodPills;
