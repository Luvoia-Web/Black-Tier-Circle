/**
 * @file app/api/platform/support/route.ts
 *
 * Support inbox. Replies go out through the store bot that owns the thread.
 */

import { z } from 'zod';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limiter';
import {
  listSupportThreads,
  readSupportThread,
  replyToSupport,
  setSupportThreadStatus,
} from '@/modules/platform/support';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

const ReplySchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().max(2000).optional().default(''),
  messageId: z.string().uuid().optional(),
});

const StatusSchema = z.object({
  threadId: z.string().uuid(),
  status: z.enum(['open', 'closed']),
});

async function scope(): Promise<{ db: ReturnType<typeof asDbClient>; owner: boolean; tenantId: string | null; userId: string }> {
  const session = await requireUser();
  const role = session.profile.role;
  if (role !== 'owner' && role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to support', 403);
  }
  const db = asDbClient(session.admin);
  if (role === 'owner') {
    return { db, owner: true, tenantId: null, userId: session.user.id };
  }
  const tenant = await getTenantByUserId(db, session.user.id);
  return { db, owner: false, tenantId: tenant.id, userId: session.user.id };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const url = new URL(request.url);
    const threadId = url.searchParams.get('thread') ?? '';
    const role = current.owner ? 'owner' : 'reseller';
    if (threadId) {
      const thread = await readSupportThread(current.db, threadId, { owner: current.owner, tenantId: current.tenantId });
      return jsonSuccess({ ...thread, role });
    }
    const inbox = await listSupportThreads(current.db, current.tenantId, current.owner, {
      status: url.searchParams.get('status') ?? 'all',
      q: url.searchParams.get('q') ?? '',
    });
    return jsonSuccess({ ...inbox, role });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const rate = await consumeRateLimit({ key: `support:reply:${current.userId}`, limit: 30, fail: 'closed' });
    if (!rate.allowed) {
      throw new ValidationError('RATE_LIMITED', 'Too many support replies. Please wait a minute.');
    }
    const parsed = ReplySchema.parse(await readJsonBody(request));
    const existing = await readSupportThread(current.db, parsed.threadId, { owner: current.owner, tenantId: current.tenantId });
    if (existing.needsMigration) {
      throw new ValidationError('SUPPORT_NEEDS_MIGRATION', 'Support tables are unavailable.');
    }
    if (!existing.thread) {
      throw new AuthError('FORBIDDEN', 'That thread is not in your store', 403);
    }
    const stored = parsed.messageId ? existing.messages.find((message) => message.id === parsed.messageId) : null;
    const result = await replyToSupport(current.db, {
      threadId: parsed.threadId,
      body: stored?.body ?? parsed.body,
      actorId: current.userId,
      ...(parsed.messageId ? { messageId: parsed.messageId } : {}),
    });
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const rate = await consumeRateLimit({ key: `support:status:${current.userId}`, limit: 30, fail: 'closed' });
    if (!rate.allowed) {
      throw new ValidationError('RATE_LIMITED', 'Too many thread updates. Please wait a minute.');
    }
    const parsed = StatusSchema.parse(await readJsonBody(request));
    const updated = await setSupportThreadStatus(current.db, {
      threadId: parsed.threadId,
      status: parsed.status,
      scope: { owner: current.owner, tenantId: current.tenantId },
      actorId: current.userId,
    });
    return jsonSuccess(updated);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
