import { Suspense } from 'react';
import { PeopleView } from './view';
import { Skeleton } from '@/components/platform/ui';

export default function PeoplePage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <PeopleView />
    </Suspense>
  );
}
