import { Suspense } from 'react';
import { Skeleton } from '@/components/platform/ui';
import { MarketingView } from './view';

export default function MarketingPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <MarketingView />
    </Suspense>
  );
}
