import { Suspense } from 'react';
import { Skeleton } from '@/components/platform/ui';
import { BroadcastsView } from './view';

export default function BroadcastsPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <BroadcastsView />
    </Suspense>
  );
}
