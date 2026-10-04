/**
 * @file app/(dashboard)/owner/layout.tsx
 *
 * Server-side owner gate for every /owner page.
 *
 * Middleware already keeps non-owners out, but several owner pages read
 * platform-wide data with the service-role client. This layout re-checks the
 * role from the database so those pages never render for anyone else.
 *
 * @module Dashboard
 */

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth/session';
import { dashboardHomeForRole } from '@/lib/navigation';

export default async function OwnerLayout({ children }: { readonly children: ReactNode }): Promise<JSX.Element> {
  let isOwner = false;
  try {
    // SECURITY: role comes from the profiles table via the verified session.
    await requireOwner();
    isOwner = true;
  } catch {
    isOwner = false;
  }
  if (!isOwner) {
    redirect(dashboardHomeForRole('reseller'));
  }
  return <>{children}</>;
}
