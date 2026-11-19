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
import { readStore, saveOwnerStoreStatus, saveResellerStoreStatus } from '@/modules/platform/store';
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

export async function GET(): Promise<Response> {
  try {
    const current = await scope();
    return jsonSuccess(await readStore(current.db, current.role, current.tenantId));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

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
      await assertResellerFieldsAllowed(current.db, ['botCopy']);
    }
    const saved = await writeStudio(current.db, current.role, current.tenantId, body, current.userId);
    if (body.publish) {
      const inserted = await current.db.from('store_config_versions').insert({
        tenant_id: current.tenantId,
        version: saved.version,
        config: saved.config,
        saved_by: current.userId,
      });
      if (inserted.error && !/does not exist|schema cache/i.test(inserted.error.message)) {
        throw new ValidationError('STORE_VERSION_FAILED', inserted.error.message);
      }
    }
    return jsonSuccess(saved);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const body = (await readJsonBody(request)) as { storeStatus?: unknown; maintenanceMessage?: unknown };
    const storeStatus = body.storeStatus === 'maintenance' ? 'maintenance' : body.storeStatus === 'open' ? 'open' : null;
    if (!storeStatus) {
      throw new ValidationError('STORE_STATUS_INVALID', 'Choose open or maintenance.');
    }
    const message = typeof body.maintenanceMessage === 'string' ? body.maintenanceMessage : '';
    if (current.role === 'owner') {
      return jsonSuccess(await saveOwnerStoreStatus(current.db, storeStatus, message));
    }
    if (!current.tenantId) {
      throw new AuthError('TENANT_REQUIRED', 'Reseller store was not found', 403);
    }
    await assertResellerFieldsAllowed(current.db, ['storeStatus', 'maintenanceMsg']);
    await saveResellerStoreStatus(current.db, current.tenantId, storeStatus, message);
    return jsonSuccess({ needsMigration: false });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(): Promise<Response> {
  try {
    const current = await scope();
    if (current.role === 'owner') {
      return jsonSuccess(await reconnectOwnerBot(current.db));
    }
    if (!current.tenantId) {
      throw new AuthError('TENANT_REQUIRED', 'Reseller store was not found', 403);
    }
    return jsonSuccess(await reconnectResellerBot(current.db, current.tenantId));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
