'use client';

import { ConnectedPage } from '@/components/platform/connected-page';

export default function OverviewPage(): JSX.Element {
  return (
    <ConnectedPage
      title="Overview"
      description="Today's revenue, the orders that need you, and what the bots are doing."
      url="/api/platform/today"
    />
  );
}
