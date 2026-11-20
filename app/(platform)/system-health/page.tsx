import { Suspense } from 'react';
import { Skeleton } from '@/components/platform/ui';
import { SystemHealthView } from './view';

export default function SystemHealthPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <SystemHealthView />
    </Suspense>
  );
}
