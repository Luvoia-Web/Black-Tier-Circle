/**
 * Asks the platform owner to review an account deletion. Does not delete the account.
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { createNotification } from '@/modules/notifications';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  try {
    const session = await requireReseller();
    const db = asDbClient(session.admin);
    const owners = await db.from('profiles').select('id').eq('role', 'owner');
    const rows = Array.isArray(owners.data) ? owners.data : [];
    for (const raw of rows) {
      const id = (raw as { id?: string }).id;
      if (!id) {
        continue;
      }
      await createNotification(db, {
        userId: id,
        tenantId: session.tenant.id,
        type: 'system',
        title: 'Account deletion requested',
        body: `${session.profile.displayName} asked to delete their reseller account.`,
        metadata: { resellerId: session.user.id },
      });
    }
    return jsonSuccess({ requested: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
