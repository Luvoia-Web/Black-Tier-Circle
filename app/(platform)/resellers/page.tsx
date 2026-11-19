import { Suspense } from 'react';
import { PeopleView } from '../people/view';
import { Skeleton } from '@/components/platform/ui';

export default function ResellersPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <PeopleView lockedType="reseller" base="/resellers" />
    </Suspense>
  );
}
