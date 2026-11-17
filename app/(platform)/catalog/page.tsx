import { Suspense } from 'react';
import { Skeleton } from '@/components/platform/ui';
import { CatalogView } from './view';

export default function CatalogPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <CatalogView />
    </Suspense>
  );
}
