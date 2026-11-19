import { Suspense } from 'react';
import { Skeleton } from '@/components/platform/ui';
import { WalletsView } from './view';

export default function WalletsPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <WalletsView />
    </Suspense>
  );
}
