/**
 * @file app/api/notifications/[id]/route.ts
 *
 * Deletes one notification owned by the caller.
 *
 * @module Api
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';

export const dynamic = 'force-dynamic';

type RouteContext = { readonly params: { readonly id: string } };

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireUser();
    const db = asDbClient(session.admin);
    const existing = await db.from('notifications').select('user_id').eq('id', context.params.id).maybeSingle();
    const ownerId = (existing.data as { user_id?: string } | null)?.user_id;
    if (!ownerId || ownerId !== session.user.id) {
      throw new AppError('NOT_FOUND', 'Notification not found', 404);
    }
    await db.from('notifications').delete().eq('id', context.params.id);
    return jsonSuccess({ deleted: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
