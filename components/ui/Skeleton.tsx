/**
 * @file components/ui/Skeleton.tsx
 *
 * Skeleton loading components for data-loading states.
 *
 * @module Components
 */

export function SkeletonCard({ className }: { readonly className?: string }): JSX.Element {
  return <div className={`skeleton shimmer h-24 rounded-xl ${className ?? ''}`} />;
}

export function SkeletonRow(): JSX.Element {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--border)] py-3">
      <div className="skeleton h-4 w-48 rounded" />
      <div className="skeleton ml-auto h-4 w-24 rounded" />
      <div className="skeleton h-6 w-16 rounded-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { readonly rows?: number }): JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="border-b border-[var(--border)] bg-[var(--bg-page)] px-4 py-3">
        <div className="skeleton h-4 w-32 rounded" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}

export function SkeletonStats(): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function SkeletonPage(): JSX.Element {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="skeleton h-8 w-48 rounded" />
      <SkeletonStats />
      <SkeletonTable />
    </div>
  );
}
