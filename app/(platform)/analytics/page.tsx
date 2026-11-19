import { Suspense } from 'react';
import { Skeleton } from '@/components/platform/ui';
import { AnalyticsView } from './view';

export default function AnalyticsPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <AnalyticsView />
    </Suspense>
  );
}
