/**
 * @file app/api/owner/settings/route.ts
 *
 * GET + PATCH platform info. Owner only. Never returns encrypted secrets.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { sanitizeInput } from '@/lib/sanitize';
import { UpdatePlatformInfoSchema } from '@/lib/validations/platform-settings';
import { getOwnerBotWebhookUrl, getPlatformSettings, updatePlatformInfo } from '@/modules/platform';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    const settings = await getPlatformSettings(asDbClient(session.admin));
    return jsonSuccess({ settings, webhookUrl: getOwnerBotWebhookUrl() });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const parsed = UpdatePlatformInfoSchema.parse(await readJsonBody(request));
    const settings = await updatePlatformInfo(asDbClient(session.admin), {
      ...(parsed.platformName !== undefined ? { platformName: sanitizeInput(parsed.platformName) } : {}),
      ...(parsed.supportContact !== undefined
        ? { supportContact: parsed.supportContact === null ? null : sanitizeInput(parsed.supportContact) }
        : {}),
      ...(parsed.supportTelegram !== undefined
        ? { supportTelegram: parsed.supportTelegram === null ? null : sanitizeInput(parsed.supportTelegram) }
        : {}),
    });
    return jsonSuccess({ settings, webhookUrl: getOwnerBotWebhookUrl() });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
