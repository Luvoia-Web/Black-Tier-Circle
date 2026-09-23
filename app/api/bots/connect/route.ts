/**
 * @file app/api/bots/connect/route.ts
 *
 * POST, reseller only. Connects exactly one Telegram bot per tenant.
 * SECURITY: botToken is never returned in the response — not even masked.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { getAppUrl } from '@/lib/env';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { ConnectBotSchema } from '@/lib/validations/bots';
import { assertTenantCanConnectBot, connectBot } from '@/modules/bots';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    assertTenantCanConnectBot(session.tenant.status);
    const parsed = ConnectBotSchema.parse(await readJsonBody(request));
    const connection = await connectBot(asDbClient(session.admin), {
      tenantId: session.tenant.id,
      botToken: parsed.botToken,
    });
    return jsonSuccess({
      username: connection.username,
      telegramBotId: connection.telegramBotId,
      webhookUrl: `${getAppUrl()}/api/webhooks/telegram/${connection.id}`,
      connectedAt: connection.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
