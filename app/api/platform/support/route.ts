/**
 * @file app/api/platform/support/route.ts
 *
 * Support inbox. Replies go out through the store bot that owns the thread.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { listSupportThreads, readSupportThread, replyToSupport } from '@/modules/platform/support';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

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
    const threadId = new URL(request.url).searchParams.get('thread') ?? '';
    if (threadId) {
      const thread = await readSupportThread(current.db, threadId, { owner: current.owner, tenantId: current.tenantId });
      return jsonSuccess(thread);
    }
    const inbox = await listSupportThreads(current.db, current.tenantId, current.owner);
    return jsonSuccess(inbox);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const body = (await readJsonBody(request)) as { threadId?: unknown; body?: unknown; messageId?: unknown };
    const threadId = typeof body.threadId === 'string' ? body.threadId : '';
    const text = typeof body.body === 'string' ? body.body : '';
    const messageId = typeof body.messageId === 'string' ? body.messageId : '';
    if (!threadId) {
      throw new ValidationError('THREAD_REQUIRED', 'Choose a thread before replying.');
    }
    const existing = await readSupportThread(current.db, threadId, { owner: current.owner, tenantId: current.tenantId });
    if (existing.needsMigration) {
      throw new ValidationError('SUPPORT_NEEDS_MIGRATION', 'Support needs migration 0032 before replies can be stored.');
    }
    if (!existing.thread) {
      throw new AuthError('FORBIDDEN', 'That thread is not in your store', 403);
    }
    const stored = messageId ? existing.messages.find((message) => message.id === messageId) : null;
    const result = await replyToSupport(current.db, {
      threadId,
      body: stored?.body ?? text,
      actorId: current.userId,
      ...(messageId ? { messageId } : {}),
    });
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
