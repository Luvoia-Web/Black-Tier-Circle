/**
 * @file app/api/reseller/webhooks/route.ts
 *
 * GET/POST: session reseller webhook endpoint management.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { DashboardCreateWebhookSchema } from '@/lib/validations/v1';
import { listWebhookEndpoints, registerWebhookEndpoint } from '@/modules/public-api/webhooks';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    const webhooks = await listWebhookEndpoints(asDbClient(session.admin), session.tenant.id);
    return jsonSuccess({ webhooks });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const parsed = DashboardCreateWebhookSchema.parse(await readJsonBody(request));
    const created = await registerWebhookEndpoint(asDbClient(session.admin), {
      tenantId: session.tenant.id,
      url: parsed.url,
      events: parsed.events,
    });
    return jsonSuccess({ webhook: created.webhook, rawSecret: created.rawSecret }, 201);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
