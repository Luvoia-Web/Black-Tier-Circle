import { Suspense } from 'react';
import { PeopleView } from '../people/view';
import { Skeleton } from '@/components/platform/ui';

export default function CustomersPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <PeopleView lockedType="buyer" base="/customers" />
    </Suspense>
  );
}
