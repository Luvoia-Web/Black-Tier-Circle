/**
 * @file app/api/owner/webhooks/route.ts
 *
 * Platform webhook endpoints owned by the store owner.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { deletePlatformWebhook, listPlatformWebhooks, registerPlatformWebhook } from '@/modules/public-api/webhooks';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  url: z.string().url().startsWith('https://', 'Webhook URL must use HTTPS'),
  events: z.array(z.enum(['order.paid', 'order.delivered', 'reseller.activated'])).min(1),
});

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    const webhooks = await listPlatformWebhooks(asDbClient(session.admin));
    return jsonSuccess({ webhooks });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = CreateSchema.parse(await readJsonBody(request));
    const created = await registerPlatformWebhook(asDbClient(session.admin), body.url, body.events);
    return jsonSuccess({ webhook: created.webhook, secret: created.rawSecret }, 201);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = z.object({ id: z.string().uuid() }).parse(await readJsonBody(request));
    await deletePlatformWebhook(asDbClient(session.admin), body.id);
    return jsonSuccess({ deleted: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
