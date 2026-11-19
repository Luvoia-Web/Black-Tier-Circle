import { Suspense } from 'react';
import { Skeleton } from '@/components/platform/ui';
import { ResellersView } from './view';

export default function ResellersPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <ResellersView />
    </Suspense>
  );
}
