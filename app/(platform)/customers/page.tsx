import { Suspense } from 'react';
import { Skeleton } from '@/components/platform/ui';
import { CustomersView } from './view';

export default function CustomersPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <CustomersView />
    </Suspense>
  );
}
