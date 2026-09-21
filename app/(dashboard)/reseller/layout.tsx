/**
 * @file app/(dashboard)/reseller/layout.tsx
 *
 * Reseller panel chrome with section tabs.
 *
 * @module Dashboard
 */

import type { ReactNode } from 'react';
import { ResellerTabs } from '@/components/reseller/reseller-tabs';

export default function ResellerLayout({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <>
      <ResellerTabs />
      {children}
    </>
  );
}
