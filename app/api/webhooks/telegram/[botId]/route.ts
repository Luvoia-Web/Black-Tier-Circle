/**
 * @file app/api/webhooks/telegram/[botId]/route.ts
 *
 * Telegram webhook receiver.
 *
 * Security flow:
 * 1. Verify X-Telegram-Bot-Api-Secret-Token header FIRST
 * 2. Return 401 immediately if secret doesn't match
 * 3. Return 200 immediately to Telegram (within 3 seconds)
 * 4. Process update asynchronously (fire-and-forget)
 *
 * The botId param is the bot_connections.id (UUID), NOT the Telegram bot ID.
 * This prevents enumeration of our internal bot IDs.
 *
 * SECURITY: Never log the full update payload (may contain user messages).
 * Log only: botId, update_id, update type.
 */

import { NextRequest, NextResponse } from 'next/server';
import { decryptBotToken, enqueueTelegramUpdate, verifyTelegramSecret } from '@/integrations/telegram/webhook';
import type { Update } from '@/integrations/telegram/types';
import { asDbClient } from '@/lib/auth/session';
import { logger } from '@/lib/logger';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getBotConnectionById } from '@/modules/bots';

type RouteContext = {
  readonly params: { readonly botId: string };
};

function updateKind(update: Update): string {
  if (update.message) {
    return 'message';
  }
  if (update.callback_query) {
    return 'callback_query';
  }
  return 'other';
}

export async function POST(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const header = req.headers.get('x-telegram-bot-api-secret-token');
    const db = asDbClient(createAdminSupabaseClient());
    const connection = await getBotConnectionById(db, params.botId);
    if (!verifyTelegramSecret(connection.webhookSecret, header)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    try {
      assertRateLimit(`tg-webhook:${params.botId}`, 100);
    } catch {
      return NextResponse.json({ ok: false, description: 'Rate limit exceeded' }, { status: 429 });
    }

    let update: Update;
    try {
      update = (await req.json()) as Update;
    } catch {
      return NextResponse.json({ ok: true });
    }

    logger.info('telegram webhook accepted', {
      botId: params.botId,
      update_id: update.update_id ?? 0,
      type: updateKind(update),
    });

    const token = decryptBotToken(connection.encryptedToken);
    enqueueTelegramUpdate(token, db, connection, connection.tenantId, update);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
