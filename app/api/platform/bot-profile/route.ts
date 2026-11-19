/**
 * Publish the bot profile to Telegram. The token never leaves the server.
 */

import { z } from 'zod';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { AppError, AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { telegramSetMyCommands, telegramSetMyDescription, telegramSetMyName, telegramSetMyShortDescription } from '@/integrations/telegram/api';
import { decryptBotToken } from '@/integrations/telegram/webhook';
import { getDecryptedOwnerBotToken } from '@/modules/platform';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1).max(64),
  short: z.string().trim().max(120),
  about: z.string().trim().max(512),
  commands: z.string().trim().max(2000),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') throw new AuthError('FORBIDDEN', 'You cannot publish a bot profile', 403);
    await assertRateLimit(`bot-profile:${session.user.id}`, 10);
    const body = Body.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    let token: string | null = null;
    if (role === 'owner') token = await getDecryptedOwnerBotToken(db);
    else {
      const tenant = await getTenantByUserId(db, session.user.id);
      const row = tenant
        ? (await db.from('bot_connections').select('encrypted_token').eq('tenant_id', tenant.id).maybeSingle()) as { data: { encrypted_token?: string } | null; error: { message: string } | null }
        : { data: null, error: null };
      if (row.error) throw new AppError('BOT_PROFILE_FAILED', row.error.message, 500);
      if (row.data?.encrypted_token) token = decryptBotToken(row.data.encrypted_token);
    }
    if (!token) throw new AppError('BOT_NOT_CONNECTED', 'Connect a bot before publishing its profile.', 400);
    await telegramSetMyName(token, body.name.replace(/^@/, ''));
    if (body.short) await telegramSetMyShortDescription(token, body.short);
    if (body.about) await telegramSetMyDescription(token, body.about);
    const commands = body.commands.split('\n').map((line) => {
      const [command, ...rest] = line.split(' - ');
      return { command: (command ?? '').replace(/^\//, '').trim(), description: rest.join(' - ').trim() || 'Open' };
    }).filter((item) => /^[a-z0-9_]{1,32}$/i.test(item.command)).slice(0, 20);
    if (commands.length > 0) await telegramSetMyCommands(token, commands);
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      action: 'bot.profile',
      target_type: 'bot',
      target_id: role,
      reason: 'publish bot profile',
    });
    return jsonSuccess({ published: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
