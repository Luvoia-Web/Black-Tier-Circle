/**
 * @file app/api/owner/settings/bot/connect/route.ts
 *
 * POST, owner only. Stores the owner bot token encrypted and registers the webhook.
 * SECURITY: the token is never returned.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { ConnectOwnerBotSchema } from '@/lib/validations/platform-settings';
import { connectOwnerBot } from '@/modules/platform';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const parsed = ConnectOwnerBotSchema.parse(await readJsonBody(request));
    const result = await connectOwnerBot(asDbClient(session.admin), parsed.botToken);
    return jsonSuccess({ username: result.username, botId: result.botId, webhookUrl: result.webhookUrl });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
