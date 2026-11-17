/**
 * @file app/api/platform/growth/route.ts
 *
 * Discount codes, announcements, and broadcasts. Referrals stay on the existing growth routes.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { getBotConnection } from '@/modules/bots';
import { broadcastBuyers, createDiscountCode, listDiscountCodes, saveEvents, setDiscountActive } from '@/modules/platform/growth';
import { readStudio } from '@/modules/store-config/access';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

async function scope() {
  const session = await requireUser();
  const role = session.profile.role;
  if (role !== 'owner' && role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to growth', 403);
  }
  const db = asDbClient(session.admin);
  const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
  const connection = tenant ? await getBotConnection(db, tenant.id) : null;
  return { db, role, tenantId: tenant?.id ?? null, botId: connection?.id ?? null, userId: session.user.id };
}

export async function GET(): Promise<Response> {
  try {
    const current = await scope();
    const codes = await listDiscountCodes(current.db, current.tenantId);
    const studio = await readStudio(current.db, current.role, current.tenantId);
    const preview = await broadcastBuyers(current.db, { role: current.role, tenantId: current.tenantId, botId: current.botId, body: 'preview', confirm: false }).catch(() => ({ recipients: 0, skippedBlocked: 0 }));
    return jsonSuccess({ role: current.role, ...codes, events: studio.config.events, recipients: 'recipients' in preview ? preview.recipients : 0 });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const body = (await readJsonBody(request)) as Record<string, unknown>;
    if (body.action === 'code') {
      const kind = body.kind === 'fixed' ? 'fixed' : body.kind === 'percent' ? 'percent' : null;
      if (!kind || typeof body.code !== 'string' || typeof body.value !== 'string') {
        throw new ValidationError('DISCOUNT_CODE_INVALID', 'Choose a code, a kind, and a value.');
      }
      const created = await createDiscountCode(current.db, current.tenantId, {
        code: body.code,
        kind,
        value: body.value,
        minOrderMinor: typeof body.minOrderMinor === 'string' ? body.minOrderMinor : '0',
        maxUses: typeof body.maxUses === 'number' ? body.maxUses : null,
        perCustomerLimit: typeof body.perCustomerLimit === 'number' ? body.perCustomerLimit : null,
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : '',
      });
      return jsonSuccess(created);
    }
    if (body.action === 'active') {
      if (typeof body.id !== 'string' || typeof body.active !== 'boolean') {
        throw new ValidationError('DISCOUNT_CODE_INVALID', 'Choose a code first.');
      }
      await setDiscountActive(current.db, current.tenantId, body.id, body.active);
      return jsonSuccess({ id: body.id, active: body.active });
    }
    if (body.action === 'events') {
      const events = body.events;
      if (!events || typeof events !== 'object') {
        throw new ValidationError('EVENTS_INVALID', 'Add a title and a body before turning announcements on.');
      }
      const record = events as Record<string, unknown>;
      await saveEvents(current.db, current.role, current.tenantId, current.userId, {
        enabled: record.enabled === true,
        title: typeof record.title === 'string' ? record.title : '',
        body: typeof record.body === 'string' ? record.body : '',
        link: typeof record.link === 'string' ? record.link : '',
      });
      return jsonSuccess({ saved: true });
    }
    if (body.action === 'broadcast') {
      if (typeof body.body !== 'string') {
        throw new ValidationError('BROADCAST_EMPTY', 'Write a message before sending it.');
      }
      const result = await broadcastBuyers(current.db, {
        role: current.role,
        tenantId: current.tenantId,
        botId: current.botId,
        body: body.body,
        confirm: body.confirm === true,
      });
      return jsonSuccess(result);
    }
    throw new ValidationError('GROWTH_ACTION_INVALID', 'Choose a growth action.');
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
