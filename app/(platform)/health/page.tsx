'use client';

import { ConnectedPage } from '@/components/platform/connected-page';

export default function HealthPage(): JSX.Element {
  return (
    <ConnectedPage
      title="System health"
      description="Launch checks and whether the bots are answering."
      url="/api/owner/launch"
    />
  );
}
