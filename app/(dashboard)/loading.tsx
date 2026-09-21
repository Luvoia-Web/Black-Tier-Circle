/**
 * @file app/(dashboard)/loading.tsx
 *
 * Dashboard route loading skeleton.
 *
 * @module Dashboard
 */

import { TableSkeleton } from '@/components/ui/fetch-states';

export default function DashboardLoading(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="skeleton h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="skeleton h-24 rounded-[var(--r-lg)]" />
        <div className="skeleton h-24 rounded-[var(--r-lg)]" />
        <div className="skeleton h-24 rounded-[var(--r-lg)]" />
        <div className="skeleton h-24 rounded-[var(--r-lg)]" />
      </div>
      <TableSkeleton />
    </div>
  );
}
