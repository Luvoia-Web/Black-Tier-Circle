'use client';

import { ConnectedPage } from '@/components/platform/connected-page';

export default function SupplierHealthPage(): JSX.Element {
  return (
    <ConnectedPage
      title="Supplier health"
      description="Whether each supplier is answering and how recent orders are moving."
      url="/api/supplier/health"
    />
  );
}
