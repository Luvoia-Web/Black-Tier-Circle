import { Suspense } from 'react';
import { MoneyView } from './view';
import { Skeleton } from '@/components/platform/ui';

export default function MoneyPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <MoneyView />
    </Suspense>
  );
}
