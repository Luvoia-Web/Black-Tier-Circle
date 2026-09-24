/**
 * @file app/api/notifications/route.ts
 *
 * Lists the signed-in user's notifications.
 *
 * @module Api
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listNotifications, unreadNotificationCount } from '@/modules/notifications';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const filter = new URL(request.url).searchParams.get('filter') ?? 'all';
    const db = asDbClient(session.admin);
    const [items, unread] = await Promise.all([
      listNotifications(db, session.user.id, filter),
      unreadNotificationCount(db, session.user.id),
    ]);
    return jsonSuccess({ items, unread });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
