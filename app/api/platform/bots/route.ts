/**
 * Bot list and one bot's detail. The tenant comes from the session.
 */

import { z } from 'zod';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { readBotDetail, readBots } from '@/modules/platform/bots-desk';
import { connectBot, disconnectBot } from '@/modules/bots';
import { connectOwnerBot } from '@/modules/platform';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

const BOT_TOKEN = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;

const Action = z.discriminatedUnion('action', [
  z.object({
    action: z.enum(['pause', 'resume', 'disconnect']),
    botId: z.string().min(1).max(80),
  }),
  z.object({
    action: z.literal('rotate'),
    botId: z.string().min(1).max(80),
    botToken: z.string().trim().regex(BOT_TOKEN, 'Paste the token from BotFather. It looks like 123456:ABC.'),
  }),
]);

async function scope() {
  const session = await requireUser();
  const role = session.profile.role;
  if (role !== 'owner' && role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to bots', 403);
  }
  const db = asDbClient(session.admin);
  const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
  return { db, role, tenantId: tenant?.id ?? null, userId: session.user.id };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const current = await scope();
    const url = new URL(request.url);
    const botId = url.searchParams.get('bot');
    if (botId) {
      return jsonSuccess({ bot: await readBotDetail(current.db, current.role, current.tenantId, botId) });
    }
    return jsonSuccess(await readBots(current.db, current.role, current.tenantId));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const current = await scope();
    await assertRateLimit(`bots:${current.userId}`, 20);
    const body = Action.parse(await readJsonBody(request));
    if (body.action === 'rotate') {
      if (body.botId === 'owner') {
        if (current.role !== 'owner') throw new AuthError('FORBIDDEN', 'Only the owner can change the owner bot', 403);
        await connectOwnerBot(current.db, body.botToken);
      } else {
        const row = (await current.db.from('bot_connections').select('tenant_id').eq('id', body.botId).maybeSingle()) as { data: { tenant_id?: string } | null; error: { message: string } | null };
        if (row.error || !row.data?.tenant_id) throw new AuthError('BOT_NOT_FOUND', 'That bot was not found', 404);
        if (current.role === 'reseller' && row.data.tenant_id !== current.tenantId) {
          throw new AuthError('FORBIDDEN', 'You can only change your own bot', 403);
        }
        await connectBot(current.db, { tenantId: row.data.tenant_id, botToken: body.botToken });
      }
      await current.db.from('audit_log').insert({
        actor_id: current.userId,
        tenant_id: current.tenantId,
        action: 'bot.rotate',
        target_type: 'bot',
        target_id: body.botId,
        reason: 'token rotated',
      });
      return jsonSuccess({ ok: true });
    }
    if (body.botId === 'owner') {
      if (current.role !== 'owner') throw new AuthError('FORBIDDEN', 'Only the owner can change the owner bot', 403);
      const status = body.action === 'resume' ? 'connected' : body.action === 'pause' ? 'paused' : 'disconnected';
      const existing = (await current.db.from('platform_settings').select('id').limit(1)) as { data: Array<{ id: string }> | null; error: { message: string } | null };
      const settingsId = existing.data?.[0]?.id;
      if (!settingsId) throw new AuthError('BOT_NOT_FOUND', 'Owner settings were not found', 404);
      const saved = await current.db.from('platform_settings').update({ owner_bot_status: status, updated_at: new Date().toISOString() }).eq('id', settingsId);
      if (saved.error) throw new AuthError('BOT_UPDATE_FAILED', saved.error.message, 500);
    } else {
      const row = (await current.db.from('bot_connections').select('tenant_id').eq('id', body.botId).maybeSingle()) as { data: { tenant_id?: string } | null; error: { message: string } | null };
      if (row.error || !row.data) throw new AuthError('BOT_NOT_FOUND', 'That bot was not found', 404);
      if (current.role === 'reseller' && row.data.tenant_id !== current.tenantId) {
        throw new AuthError('FORBIDDEN', 'You can only change your own bot', 403);
      }
      if (body.action === 'disconnect' && row.data.tenant_id) {
        await disconnectBot(current.db, row.data.tenant_id);
      } else {
        const status = body.action === 'resume' ? 'connected' : 'paused';
        const saved = await current.db.from('bot_connections').update({ status, updated_at: new Date().toISOString() }).eq('id', body.botId);
        if (saved.error) throw new AuthError('BOT_UPDATE_FAILED', saved.error.message, 500);
      }
    }
    await current.db.from('audit_log').insert({
      actor_id: current.userId,
      tenant_id: current.tenantId,
      action: `bot.${body.action}`,
      target_type: 'bot',
      target_id: body.botId,
      reason: 'bot operation',
    });
    return jsonSuccess({ ok: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
