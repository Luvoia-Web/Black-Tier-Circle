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
      <div className="rounded-lg border border-gray-800 bg-gray-900 px-6 py-12 text-center text-sm text-gray-400">
        No activity yet
      </div>
    </>
  );
}
