/**
 * @file app/api/notifications/read-all/route.ts
 *
 * Marks every notification for the signed-in user as read.
 *
 * @module Api
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function PATCH(): Promise<Response> {
  try {
    const session = await requireUser();
    const db = asDbClient(session.admin);
    const listed = await db.from('notifications').select('id').eq('user_id', session.user.id);
    const rows = Array.isArray(listed.data) ? listed.data : [];
    for (const raw of rows) {
      const id = (raw as { id?: string }).id;
      if (id) {
        await db.from('notifications').update({ is_read: true }).eq('id', id);
      }
    }
    return jsonSuccess({ updated: rows.length });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
