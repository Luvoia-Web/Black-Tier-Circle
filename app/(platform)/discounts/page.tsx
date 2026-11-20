import { Suspense } from 'react';
import { Skeleton } from '@/components/platform/ui';
import { DiscountsView } from './view';

export default function DiscountsPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <DiscountsView />
    </Suspense>
  );
}
