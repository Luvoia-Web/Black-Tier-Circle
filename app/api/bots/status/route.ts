/**
 * @file app/api/bots/status/route.ts
 *
 * GET, reseller only. Current bot connection status for the session tenant.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { getAppUrl } from '@/lib/env';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { getBotConnection, listCustomers } from '@/modules/bots';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    if (session.tenant.status !== 'active') {
      return jsonSuccess({
        connected: false,
        pending: true,
      });
    }
    const connection = await getBotConnection(asDbClient(session.admin), session.tenant.id);
    if (connection === null) {
      return jsonSuccess({ connected: false, pending: false });
    }
    const customers = await listCustomers(asDbClient(session.admin), connection.id);
    return jsonSuccess({
      connected: connection.status === 'connected',
      pending: false,
      username: connection.username,
      telegramBotId: connection.telegramBotId,
      status: connection.status,
      lastHealthAt: connection.lastHealthAt ? connection.lastHealthAt.toISOString() : null,
      webhookUrl: `${getAppUrl()}/api/webhooks/telegram/${connection.id}`,
      customerCount: customers.length,
      connectedAt: connection.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
