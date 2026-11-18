'use client';

import { ConnectedPage } from '@/components/platform/connected-page';

export default function IntelligencePage(): JSX.Element {
  return (
    <ConnectedPage
      title="Intelligence"
      description="What the stores remember about buyers, recovery, and outcomes."
      url="/api/intelligence/platform"
    />
  );
}
