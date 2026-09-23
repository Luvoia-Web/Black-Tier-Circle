/**
 * @file app/api/webhooks/telegram/owner/route.ts
 *
 * Owner store bot webhook. Secret and token come from platform_settings.
 *
 * @module Api
 */

import { NextRequest, NextResponse } from 'next/server';
import { processTelegramUpdate, verifyTelegramSecret } from '@/integrations/telegram/webhook';
import type { Update } from '@/integrations/telegram/types';
import { asDbClient } from '@/lib/auth/session';
import { logger } from '@/lib/logger';
import { OWNER_STORE_BOT_ID } from '@/lib/owner-bot';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { scheduleAfterResponse } from '@/lib/schedule-after';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { BotConnection } from '@/modules/bots/types';
import { getDecryptedOwnerBotToken, getOwnerBotWebhookSecret, getPlatformSettings } from '@/modules/platform';

function ownerConnection(secret: string, username: string, telegramBotId: string | null): BotConnection {
  const now = new Date();
  return {
    id: OWNER_STORE_BOT_ID,
    tenantId: '',
    telegramBotId: telegramBotId && /^\d+$/.test(telegramBotId) ? telegramBotId : OWNER_STORE_BOT_ID,
    username,
    webhookSecret: secret,
    status: 'connected',
    lastHealthAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const db = asDbClient(createAdminSupabaseClient());
    const secret = await getOwnerBotWebhookSecret(db);
    const header = req.headers.get('x-telegram-bot-api-secret-token');
    if (secret === null || !verifyTelegramSecret(secret, header)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    try {
      assertRateLimit('tg-webhook:owner', 100);
    } catch {
      return NextResponse.json({ ok: false, description: 'Rate limit exceeded' }, { status: 429 });
    }
    const token = await getDecryptedOwnerBotToken(db);
    if (token === null) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    let update: Update;
    try {
      update = (await req.json()) as Update;
    } catch {
      return NextResponse.json({ ok: true });
    }

    logger.info('telegram webhook accepted', {
      botId: OWNER_STORE_BOT_ID,
      update_id: update.update_id ?? 0,
      type: update.message ? 'message' : update.callback_query ? 'callback_query' : 'other',
    });

    const settings = await getPlatformSettings(db);
    const connection = ownerConnection(secret, settings.ownerBotUsername ?? 'owner_store', settings.ownerBotId);
    const work = (): Promise<void> => processTelegramUpdate(token, db, connection, null, update);
    const deferred = await scheduleAfterResponse(work);
    if (!deferred) {
      await work();
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
