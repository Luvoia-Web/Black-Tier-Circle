/**
 * @file app/api/owner/settings/bot/test/route.ts
 *
 * POST, owner only. Calls Telegram getMe and records a health check.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { testOwnerBot } from '@/modules/platform';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  try {
    const session = await requireOwner();
    const result = await testOwnerBot(asDbClient(session.admin));
    return jsonSuccess({ username: result.username, botId: result.botId, webhookUrl: result.webhookUrl });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
