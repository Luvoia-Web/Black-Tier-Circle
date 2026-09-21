/**
 * @file app/api/reseller/api-keys/route.ts
 *
 * GET/POST: session reseller API key management.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { DashboardCreateApiKeySchema } from '@/lib/validations/v1';
import { generateApiKey, listApiKeys } from '@/modules/public-api';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    const keys = await listApiKeys(asDbClient(session.admin), session.tenant.id);
    return jsonSuccess({ keys });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const parsed = DashboardCreateApiKeySchema.parse(await readJsonBody(request));
    const created = await generateApiKey(asDbClient(session.admin), {
      tenantId: session.tenant.id,
      label: parsed.label,
      environment: parsed.environment,
      createdBy: session.profile.id,
      ...(parsed.scopes !== undefined ? { scopes: parsed.scopes } : {}),
      ...(parsed.expiresAt !== undefined ? { expiresAt: new Date(parsed.expiresAt) } : {}),
    });
    return jsonSuccess({ key: created.apiKey, rawKey: created.rawKey }, 201);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
