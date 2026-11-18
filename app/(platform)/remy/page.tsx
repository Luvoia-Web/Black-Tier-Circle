/**
 * Full-page Remy. The launcher on every other page opens the same chat.
 */

import { redirect } from 'next/navigation';
import { AssistantPage } from '@/components/assistant/assistant-page';
import { asDbClient } from '@/lib/auth/session';
import { NotFoundError } from '@/lib/errors';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getProfile } from '@/modules/identity';

export default async function RemyPage(): Promise<JSX.Element> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    redirect(ROUTES.login);
  }
  try {
    const profile = await getProfile(asDbClient(createAdminSupabaseClient()), user.id);
    return <AssistantPage displayName={profile.displayName} role={profile.role === 'reseller' ? 'reseller' : 'owner'} />;
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      redirect(ROUTES.login);
    }
    throw error;
  }
}
