/**
 * @file components/coming-soon.tsx
 *
 * Placeholder body for routes reserved for later phases.
 *
 * @module Components
 */

import { PageHeader } from '@/components/ui/page-header';

type ComingSoonProps = {
  readonly title: string;
};

/**
 * Renders a later-phase placeholder page.
 *
 * @param props - Page title
 */
export function ComingSoon({ title }: ComingSoonProps): JSX.Element {
  return (
    <>
      <PageHeader title={title} description="This area ships in a later phase." />
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-12 text-center text-sm text-[var(--text-2)]">
        No activity yet
      </div>
    </>
  );
}
