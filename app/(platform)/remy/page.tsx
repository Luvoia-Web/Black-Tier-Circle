'use client';

import { ConnectedPage } from '@/components/platform/connected-page';

export default function RemyPage(): JSX.Element {
  return (
    <ConnectedPage
      title="Remy AI"
      description="Ask Remy about orders, buyers, and the store. The chat is restored in this step."
      url="/api/health"
    />
  );
}
