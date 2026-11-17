import { Suspense } from 'react';
import { OrdersView } from './view';
import { Skeleton } from '@/components/platform/ui';

export default function OrdersPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <OrdersView />
    </Suspense>
  );
}
