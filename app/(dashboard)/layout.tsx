/**
 * @file app/(dashboard)/layout.tsx
 *
 * Dashboard layout — sidebar + topbar + main content.
 * Matches Sweatpals/Mobbin reference: collapsible sidebar, clean topbar,
 * dark/light mode toggle via data-theme on <html>.
 * Middleware already gates these routes; this layout loads the profile for chrome.
 *
 * @module Dashboard
 */

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { NotFoundError } from '@/lib/errors';
import { ROUTES } from '@/lib/navigation';
import { isPlatformPaymentConfigured } from '@/lib/payment-config';
import { getPlatformSettings } from '@/modules/platform';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { asDbClient } from '@/lib/auth/session';
import { getProfile, type UserProfile } from '@/modules/identity';

type DashboardLayoutProps = {
  readonly children: ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps): Promise<JSX.Element> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    redirect(ROUTES.login);
  }

  const admin = createAdminSupabaseClient();
  let profile: UserProfile;
  try {
    profile = await getProfile(asDbClient(admin), user.id);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      redirect(ROUTES.login);
    }
    throw error;
  }

  let demoMode = true;
  try {
    const settings = await getPlatformSettings(asDbClient(admin));
    demoMode = !isPlatformPaymentConfigured(settings);
  } catch {
    demoMode = true;
  }

  return (
    <DashboardShell
      displayName={profile.displayName}
      role={profile.role}
      avatarUrl={profile.avatarUrl}
      demoMode={demoMode}
    >
      {children}
    </DashboardShell>
  );
}
