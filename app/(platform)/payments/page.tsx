import { Suspense } from 'react';
import { Skeleton } from '@/components/platform/ui';
import { PaymentsView } from './view';

export default function PaymentsPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <PaymentsView />
    </Suspense>
  );
}
