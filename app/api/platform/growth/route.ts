/**
 * @file app/api/platform/growth/route.ts
 *
 * Discount codes, announcements, and broadcasts. Referrals stay on the existing growth routes.
 */

import { z } from 'zod';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { getBotConnection } from '@/modules/bots';
import {
  BROADCAST_AUDIENCES,
  broadcastBuyers,
  cancelScheduledBroadcast,
  createDiscountCode,
  deleteDiscountCode,
  listBroadcastJobs,
  listDiscountCodes,
  readAudienceCounts,
  readStoreNameAndLinks,
  saveEvents,
  scheduleBroadcast,
  setDiscountActive,
  updateDiscountCode,
} from '@/modules/platform/growth';
import { readStudio } from '@/modules/store-config/access';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

const DiscountFields = {
  code: z.string().trim().min(3).max(32),
  kind: z.enum(['percent', 'fixed']),
  value: z.string().trim().min(1).max(24),
  minOrderMinor: z.string().trim().max(24).optional().default('0'),
  maxUses: z.number().int().min(1).max(1_000_000).nullable().optional().default(null),
  perCustomerLimit: z.number().int().min(1).max(1_000).nullable().optional().default(1),
  startsAt: z.string().trim().max(64).optional().default(''),
  expiresAt: z.string().trim().max(64).optional().default(''),
};

const GrowthPostSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('code'), ...DiscountFields }),
  z.object({ action: z.literal('update_code'), id: z.string().uuid(), ...DiscountFields }),
  z.object({ action: z.literal('active'), id: z.string().uuid(), active: z.boolean() }),
  z.object({ action: z.literal('delete_code'), id: z.string().uuid() }),
  z.object({
    action: z.literal('events'),
    events: z.object({
      enabled: z.boolean(),
      title: z.string().max(120).optional().default(''),
      body: z.string().max(2000).optional().default(''),
      link: z.string().max(300).optional().default(''),
    }),
  }),
  z.object({
    action: z.literal('broadcast'),
    body: z.string().min(1).max(4096),
    imageUrl: z.string().max(500).optional().default(''),
    audience: z.enum(BROADCAST_AUDIENCES).optional().default('all'),
    confirm: z.boolean().optional().default(false),
  }),
  z.object({
    action: z.literal('schedule_broadcast'),
    body: z.string().min(1).max(4096),
    imageUrl: z.string().max(500).optional().default(''),
    audience: z.enum(BROADCAST_AUDIENCES).optional().default('all'),
    scheduledFor: z.string().trim().min(1).max(64),
  }),
  z.object({
    action: z.literal('cancel_broadcast'),
    id: z.string().uuid(),
  }),
]);

async function scope() {
  const session = await requireUser();
  const role = session.profile.role;
  if (role !== 'owner' && role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to growth', 403);
  }
  const db = asDbClient(session.admin);
  const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
  const connection = tenant ? await getBotConnection(db, tenant.id) : null;
  const profileRow = (await db.from('profiles').select('telegram_chat_id').eq('id', session.user.id).maybeSingle()) as {
    data: { telegram_chat_id?: string | null } | null;
  };
  const testChatId = typeof profileRow.data?.telegram_chat_id === 'string' ? profileRow.data.telegram_chat_id : null;
  return { db, role, tenantId: tenant?.id ?? null, botId: connection?.id ?? null, userId: session.user.id, testChatId };
}

export async function GET(): Promise<Response> {
  try {
    const current = await scope();
    const [codes, studio, audiences, broadcasts, storeMeta] = await Promise.all([
      listDiscountCodes(current.db, current.tenantId),
      readStudio(current.db, current.role, current.tenantId),
      readAudienceCounts(current.db, current.role, current.tenantId, current.botId).catch(() => ({ all: 0, buyers: 0, inactive: 0, skippedBlocked: 0 })),
      listBroadcastJobs(current.db, current.tenantId),
      readStoreNameAndLinks(current.db, current.role, current.tenantId).catch(() => ({ store: 'Black Tier Circle', channel: '', group: '', website: '' })),
    ]);
    return jsonSuccess({
      role: current.role,
      ...codes,
      events: studio.config.events,
      storeName: storeMeta.store,
      links: {
        channel: storeMeta.channel,
        group: storeMeta.group,
        website: storeMeta.website,
      },
      recipients: audiences.all,
      audiences,
      broadcasts: broadcasts.jobs,
      broadcastsNeedsMigration: broadcasts.needsMigration,
      testChatId: current.testChatId,
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const current = await scope();
    await assertRateLimit(`platform-growth:${current.userId}`, 30);
    const parsed = GrowthPostSchema.parse(await readJsonBody(request));

    if (parsed.action === 'code') {
      const created = await createDiscountCode(current.db, current.tenantId, parsed, current.userId);
      return jsonSuccess(created);
    }
    if (parsed.action === 'update_code') {
      await updateDiscountCode(current.db, current.tenantId, parsed.id, parsed, current.userId);
      return jsonSuccess({ id: parsed.id, updated: true });
    }
    if (parsed.action === 'active') {
      await setDiscountActive(current.db, current.tenantId, parsed.id, parsed.active, current.userId);
      return jsonSuccess({ id: parsed.id, active: parsed.active });
    }
    if (parsed.action === 'delete_code') {
      await deleteDiscountCode(current.db, current.tenantId, parsed.id, current.userId);
      return jsonSuccess({ id: parsed.id, deleted: true });
    }
    if (parsed.action === 'events') {
      await saveEvents(current.db, current.role, current.tenantId, current.userId, parsed.events);
      return jsonSuccess({ saved: true });
    }
    if (parsed.action === 'broadcast') {
      const result = await broadcastBuyers(current.db, {
        role: current.role,
        tenantId: current.tenantId,
        botId: current.botId,
        body: parsed.body,
        imageUrl: parsed.imageUrl,
        audience: parsed.audience,
        confirm: parsed.confirm,
        actorId: current.userId,
      });
      return jsonSuccess(result);
    }
    if (parsed.action === 'schedule_broadcast') {
      const result = await scheduleBroadcast(current.db, {
        role: current.role,
        tenantId: current.tenantId,
        botId: current.botId,
        actorId: current.userId,
        body: parsed.body,
        imageUrl: parsed.imageUrl,
        audience: parsed.audience,
        scheduledFor: parsed.scheduledFor,
      });
      return jsonSuccess(result);
    }
    await cancelScheduledBroadcast(current.db, current.tenantId, parsed.id, current.userId);
    return jsonSuccess({ id: parsed.id, canceled: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
