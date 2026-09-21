/**
 * @file app/(dashboard)/layout.tsx
 *
 * Shared dashboard layout with sidebar and top bar.
 * Middleware already gates these routes; this layout loads the profile for chrome.
 *
 * @module Dashboard
 */

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { NotFoundError } from '@/lib/errors';
import { ROUTES } from '@/lib/navigation';
import { PAYMENT_CONFIG } from '@/lib/payment-config';
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

  return (
    <DashboardShell displayName={profile.displayName} role={profile.role} demoMode={PAYMENT_CONFIG.mode === 'demo'}>
      {children}
    </DashboardShell>
  );
}
