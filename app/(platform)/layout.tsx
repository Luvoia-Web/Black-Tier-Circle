/**
 * @file app/(platform)/layout.tsx
 *
 * Auth gate for the eight new areas. The old dashboard layout is not used.
 */

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { PlatformShell } from '@/components/platform/shell';
import { asDbClient } from '@/lib/auth/session';
import { NotFoundError } from '@/lib/errors';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getProfile, type UserProfile } from '@/modules/identity';

type PlatformLayoutProps = {
  readonly children: ReactNode;
};

export default async function PlatformLayout({ children }: PlatformLayoutProps): Promise<JSX.Element> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    redirect(ROUTES.login);
  }

  let profile: UserProfile;
  try {
    profile = await getProfile(asDbClient(createAdminSupabaseClient()), user.id);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      redirect(ROUTES.login);
    }
    throw error;
  }

  return (
    <PlatformShell displayName={profile.displayName} role={profile.role}>
      {children}
    </PlatformShell>
  );
}
