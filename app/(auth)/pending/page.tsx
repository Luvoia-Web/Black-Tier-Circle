/**
 * Waiting room for resellers whose account is still pending owner approval.
 */

import { PendingWait } from '@/components/auth/pending-wait';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { asDbClient } from '@/lib/auth/session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getPlatformSettings } from '@/modules/platform';

export default async function PendingPage(): Promise<JSX.Element> {
  let supportContact: string | null = null;
  try {
    const settings = await getPlatformSettings(asDbClient(createAdminSupabaseClient()));
    supportContact = settings.supportContact;
  } catch {
    supportContact = null;
  }

  return (
    <main className="login-stage">
      <div className="login-grid" aria-hidden="true" />
      <div className="login-orb login-orb-1" aria-hidden="true" />
      <div className="login-orb login-orb-2" aria-hidden="true" />
      <div className="login-orb login-orb-3" aria-hidden="true" />
      <div className="absolute right-6 top-6 z-10">
        <ThemeToggle />
      </div>
      <PendingWait supportContact={supportContact} />
    </main>
  );
}
