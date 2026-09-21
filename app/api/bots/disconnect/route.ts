/**
 * @file app/api/bots/disconnect/route.ts
 *
 * POST, reseller only. Disconnects the current bot and deletes the Telegram webhook.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { disconnectBot } from '@/modules/bots';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  try {
    const session = await requireReseller();
    await disconnectBot(asDbClient(session.admin), session.tenant.id);
    return jsonSuccess({ success: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
