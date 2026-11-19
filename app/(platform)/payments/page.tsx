import { Suspense } from 'react';
import { MoneyView } from '../money/view';
import { Skeleton } from '@/components/platform/ui';

export default function PaymentsPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <MoneyView focus="payments" />
    </Suspense>
  );
}
