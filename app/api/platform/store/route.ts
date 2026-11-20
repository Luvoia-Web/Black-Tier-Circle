/**
 * @file app/api/platform/store/route.ts
 *
 * Store editor, open or maintenance, and bot reconnect.
 */

import { z } from 'zod';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { reconnectResellerBot } from '@/modules/bots';
import { reconnectOwnerBot } from '@/modules/platform/index';
import { assertResellerFieldsAllowed } from '@/modules/platform/policy';
import { readStore, readStoreVersion, saveOwnerStoreStatus, saveResellerStoreStatus } from '@/modules/platform/store';
import { writeStudio } from '@/modules/store-config/access';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

async function scope() {
  const session = await requireUser();
  const role = session.profile.role;
  if (role !== 'owner' && role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to the store', 403);
  }
  const db = asDbClient(session.admin);
  const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
  return { db, role, tenantId: tenant?.id ?? null, userId: session.user.id };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const version = new URL(request.url).searchParams.get('version');
    if (version) {
      const parsed = z.coerce.number().int().positive().max(100000).parse(version);
      return jsonSuccess(await readStoreVersion(current.db, current.role, current.tenantId, parsed));
    }
    return jsonSuccess(await readStore(current.db, current.role, current.tenantId, current.userId));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

const StoreStatusSchema = z.object({
  storeStatus: z.enum(['open', 'maintenance']),
  maintenanceMessage: z.string().max(500).optional().default(''),
});

const ReconnectSchema = z.object({}).strict().optional();

export async function PUT(request: Request): Promise<Response> {
  try {
    const current = await scope();
    await assertRateLimit(`store:${current.userId}`, 30);
    const body = z.object({
      config: z.unknown(),
      version: z.number().int().nonnegative(),
      publish: z.boolean().optional(),
    }).parse(await readJsonBody(request));
    if (current.role === 'reseller') {
      await assertResellerFieldsAllowed(current.db, ['botCopy'], current.tenantId);
    }
    const saved = await writeStudio(current.db, current.role, current.tenantId, body, current.userId);
    if (body.publish) {
      const inserted = await current.db.from('store_config_versions').insert({
        tenant_id: current.tenantId,
        version: saved.version,
        config: saved.config,
        saved_by: current.userId,
      });
      if (inserted.error) {
        throw new ValidationError('STORE_VERSION_FAILED', inserted.error.message);
      }
    }
    await current.db.from('audit_log').insert({
      actor_id: current.userId,
      tenant_id: current.tenantId,
      action: body.publish ? 'store.publish' : 'store.save',
      target_type: 'store_config',
      target_id: current.tenantId ?? 'owner',
      reason: body.publish ? `Published store config v${saved.version}` : `Saved store config draft v${saved.version}`,
    });
    return jsonSuccess(saved);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const current = await scope();
    await assertRateLimit(`store-status:${current.userId}`, 20);
    const parsed = StoreStatusSchema.parse(await readJsonBody(request));
    if (current.role === 'owner') {
      const res = await saveOwnerStoreStatus(current.db, parsed.storeStatus, parsed.maintenanceMessage);
      await current.db.from('audit_log').insert({
        actor_id: current.userId,
        tenant_id: null,
        action: 'store.status',
        target_type: 'store',
        target_id: 'owner',
        reason: `Store status set to ${parsed.storeStatus}`,
        after_val: { storeStatus: parsed.storeStatus },
      });
      return jsonSuccess(res);
    }
    if (!current.tenantId) {
      throw new AuthError('TENANT_REQUIRED', 'Reseller store was not found', 403);
    }
    await assertResellerFieldsAllowed(current.db, ['storeStatus', 'maintenanceMsg'], current.tenantId);
    await saveResellerStoreStatus(current.db, current.tenantId, parsed.storeStatus, parsed.maintenanceMessage);
    await current.db.from('audit_log').insert({
      actor_id: current.userId,
      tenant_id: current.tenantId,
      action: 'store.status',
      target_type: 'store',
      target_id: current.tenantId,
      reason: `Store status set to ${parsed.storeStatus}`,
      after_val: { storeStatus: parsed.storeStatus },
    });
    return jsonSuccess({ needsMigration: false });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const current = await scope();
    await assertRateLimit(`store-reconnect:${current.userId}`, 10);
    const raw = await request.text();
    if (raw.trim().length > 0) {
      ReconnectSchema.parse(JSON.parse(raw));
    }
    if (current.role === 'owner') {
      const reconnected = await reconnectOwnerBot(current.db);
      await current.db.from('audit_log').insert({
        actor_id: current.userId,
        tenant_id: null,
        action: 'bot.reconnect',
        target_type: 'bot',
        target_id: 'owner',
        reason: 'Reconnected owner bot webhook',
      });
      return jsonSuccess(reconnected);
    }
    if (!current.tenantId) {
      throw new AuthError('TENANT_REQUIRED', 'Reseller store was not found', 403);
    }
    const reconnected = await reconnectResellerBot(current.db, current.tenantId);
    await current.db.from('audit_log').insert({
      actor_id: current.userId,
      tenant_id: current.tenantId,
      action: 'bot.reconnect',
      target_type: 'bot',
      target_id: current.tenantId,
      reason: 'Reconnected reseller bot webhook',
    });
    return jsonSuccess(reconnected);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
