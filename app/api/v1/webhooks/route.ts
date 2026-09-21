/**
 * @file app/api/v1/webhooks/route.ts
 *
 * Webhook endpoint management for the public v1 API.
 *
 * @module ApiV1
 */

import { API_CONFIG } from '@/lib/api-config';
import { readJsonBody } from '@/lib/http';
import { authenticateV1Request, handleV1Error, v1Db, v1Success } from '@/lib/v1-auth';
import { V1WebhookCreateSchema, V1WebhookDeleteSchema } from '@/lib/validations/v1';
import {
  deleteWebhookEndpoint,
  listWebhookEndpoints,
  registerWebhookEndpoint,
} from '@/modules/public-api/webhooks';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function presentWebhook(row: {
  id: string;
  url: string;
  events: readonly string[];
  isActive: boolean;
  failureCount: number;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  secretPrefix: string;
}): Record<string, unknown> {
  return {
    webhookId: row.id,
    url: row.url,
    events: row.events,
    isActive: row.isActive,
    failureCount: row.failureCount,
    lastTriggeredAt: row.lastTriggeredAt ? row.lastTriggeredAt.toISOString() : null,
    secretPrefix: row.secretPrefix,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const ctx = await authenticateV1Request(
      request,
      'webhook:manage',
      'webhooks.read',
      API_CONFIG.rateLimits.defaultRequestsPerMinute,
    );
    const rows = await listWebhookEndpoints(v1Db(), ctx.tenantId);
    return v1Success(rows.map(presentWebhook));
  } catch (error: unknown) {
    return handleV1Error(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const ctx = await authenticateV1Request(
      request,
      'webhook:manage',
      'webhooks.create',
      API_CONFIG.rateLimits.defaultRequestsPerMinute,
    );
    const parsed = V1WebhookCreateSchema.parse(await readJsonBody(request));
    const created = await registerWebhookEndpoint(v1Db(), {
      tenantId: ctx.tenantId,
      url: parsed.url,
      events: parsed.events,
    });
    return v1Success(
      {
        ...presentWebhook(created.webhook),
        secret: created.rawSecret,
      },
      undefined,
      201,
    );
  } catch (error: unknown) {
    return handleV1Error(error);
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const ctx = await authenticateV1Request(
      request,
      'webhook:manage',
      'webhooks.delete',
      API_CONFIG.rateLimits.defaultRequestsPerMinute,
    );
    const parsed = V1WebhookDeleteSchema.parse(await readJsonBody(request));
    await deleteWebhookEndpoint(v1Db(), parsed.webhookId, ctx.tenantId);
    return v1Success({ deleted: true });
  } catch (error: unknown) {
    return handleV1Error(error);
  }
}
