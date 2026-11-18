'use client';

import { ConnectedPage } from '@/components/platform/connected-page';

export default function AnalyticsPage(): JSX.Element {
  return (
    <ConnectedPage
      title="Analytics"
      description="Revenue and orders across the range you pick. The full charts arrive in a later step."
      url="/api/platform/today"
    />
  );
}
