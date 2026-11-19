import { Suspense } from 'react';
import { Skeleton } from '@/components/platform/ui';
import { IntelligenceView } from './view';

export default function IntelligencePage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <IntelligenceView />
    </Suspense>
  );
}
