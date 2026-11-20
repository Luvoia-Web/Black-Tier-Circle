/**
 * Sends the current studio message to the signed-in user's own Telegram chat.
 * The chat id is stored on their profile. The bot token never leaves the server.
 */

import { z } from 'zod';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { AppError, AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { telegramSendHtml, telegramSendPhoto } from '@/integrations/telegram/api';
import { decryptBotToken } from '@/integrations/telegram/webhook';
import { getDecryptedOwnerBotToken } from '@/modules/platform';
import { isAllowedBotUrl } from '@/modules/store-config/urls';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

const ChatIdSchema = z
  .string()
  .trim()
  .regex(/^-?[0-9]{5,20}$/, 'Use the numeric chat id Telegram shows for your account.');

const Body = z.object({
  text: z.string().trim().min(1).max(4096),
  imageUrl: z.string().trim().max(500).optional().default(''),
  chatId: ChatIdSchema,
});

const SaveChatIdBody = z.object({
  chatId: ChatIdSchema,
});

async function tokenFor(db: ReturnType<typeof asDbClient>, role: 'owner' | 'reseller', userId: string): Promise<string> {
  if (role === 'owner') {
    const token = await getDecryptedOwnerBotToken(db);
    if (!token) throw new AppError('BOT_NOT_CONNECTED', 'Connect a bot before sending a test.', 400);
    return token;
  }
  const tenant = await getTenantByUserId(db, userId);
  if (!tenant) throw new AuthError('TENANT_REQUIRED', 'Reseller store was not found', 403);
  const row = (await db.from('bot_connections').select('encrypted_token').eq('tenant_id', tenant.id).maybeSingle()) as {
    data: { encrypted_token?: string } | null;
    error: { message: string } | null;
  };
  if (row.error) throw new AppError('BOT_TEST_FAILED', row.error.message, 500);
  if (!row.data?.encrypted_token) throw new AppError('BOT_NOT_CONNECTED', 'Connect a bot before sending a test.', 400);
  return decryptBotToken(row.data.encrypted_token);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') throw new AuthError('FORBIDDEN', 'You cannot send a studio test', 403);
    await assertRateLimit(`studio-test:${session.user.id}`, 5);
    const body = Body.parse(await readJsonBody(request));
    if (body.imageUrl && !isAllowedBotUrl(body.imageUrl)) {
      throw new ValidationError('STUDIO_IMAGE_INVALID', 'The image must be an https:// link.');
    }
    const db = asDbClient(session.admin);
    const saved = await db.from('profiles').update({ telegram_chat_id: body.chatId }).eq('id', session.user.id);
    if (saved.error) throw new AppError('TEST_CHAT_FAILED', saved.error.message, 500);
    const token = await tokenFor(db, role, session.user.id);
    const text = body.imageUrl ? body.text.slice(0, 1024) : body.text;
    if (body.imageUrl) await telegramSendPhoto(token, body.chatId, body.imageUrl, text);
    else await telegramSendHtml(token, body.chatId, text);
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      action: 'bot.test',
      target_type: 'telegram_chat',
      target_id: body.chatId,
      reason: 'studio test send',
    });
    return jsonSuccess({ sent: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') throw new AuthError('FORBIDDEN', 'You cannot save a test chat id', 403);
    await assertRateLimit(`studio-test-chat:${session.user.id}`, 20);
    const body = SaveChatIdBody.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const saved = await db.from('profiles').update({ telegram_chat_id: body.chatId }).eq('id', session.user.id);
    if (saved.error) throw new AppError('TEST_CHAT_FAILED', saved.error.message, 500);
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      action: 'profile.telegram_chat_id',
      target_type: 'profile',
      target_id: session.user.id,
      reason: 'Saved Telegram test chat id',
    });
    return jsonSuccess({ saved: true, chatId: body.chatId });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
