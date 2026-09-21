/**
 * @file app/api/reseller/webhooks/[webhookId]/route.ts
 *
 * PATCH/DELETE: toggle or remove a webhook endpoint.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { deleteWebhookEndpoint, setWebhookActive } from '@/modules/public-api/webhooks';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: { webhookId: string };
};

const PatchSchema = z.object({
  isActive: z.boolean(),
});

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireReseller();
    const parsed = PatchSchema.parse(await readJsonBody(request));
    const webhook = await setWebhookActive(
      asDbClient(session.admin),
      context.params.webhookId,
      session.tenant.id,
      parsed.isActive,
    );
    return jsonSuccess({ webhook });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireReseller();
    await deleteWebhookEndpoint(asDbClient(session.admin), context.params.webhookId, session.tenant.id);
    return jsonSuccess({ deleted: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
