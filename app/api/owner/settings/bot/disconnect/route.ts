/**
 * @file app/api/owner/settings/bot/disconnect/route.ts
 *
 * POST, owner only. Deletes the Telegram webhook and clears the stored token.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { disconnectOwnerBot } from '@/modules/platform';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  try {
    const session = await requireOwner();
    await disconnectOwnerBot(asDbClient(session.admin));
    return jsonSuccess({ disconnected: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
