/**
 * @file components/ui/stat-card.tsx
 *
 * Dashboard statistic card with label, value, and optional trend text.
 *
 * @module Components
 */

type StatCardProps = {
  readonly label: string;
  readonly value: string;
  readonly trend?: string;
};

/**
 * Renders a dark-theme metric card.
 *
 * @param props - Label, value, and optional trend
 */
export function StatCard({ label, value, trend }: StatCardProps): JSX.Element {
  return (
    <article className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-100">{value}</p>
      {trend ? <p className="mt-1 text-xs text-gray-400">{trend}</p> : null}
    </article>
  );
}
