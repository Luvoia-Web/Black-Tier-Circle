/**
 * @file app/api/admin/bots/route.ts
 *
 * GET, owner only. Lists reseller bot connections for the owner dashboard.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { isOwnerBotConfigured } from '@/lib/owner-bot';
import { listResellerBotOverview } from '@/modules/bots';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    const bots = await listResellerBotOverview(asDbClient(session.admin));
    return jsonSuccess({
      ownerBotConfigured: isOwnerBotConfigured(),
      bots: bots.map((item) => ({
        id: item.connection.id,
        reseller: item.resellerName,
        tenantName: item.tenantName,
        username: item.connection.username,
        status: item.connection.status,
        lastHealthAt: item.connection.lastHealthAt ? item.connection.lastHealthAt.toISOString() : null,
        customerCount: item.customerCount,
        connectedSince: item.connection.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
