/**
 * @file app/api/webhooks/telegram/owner/route.ts
 *
 * Owner store bot webhook. Uses OWNER_BOT_WEBHOOK_SECRET and tenantId=null.
 *
 * @module Api
 */

import { NextRequest, NextResponse } from 'next/server';
import { enqueueTelegramUpdate, verifyTelegramSecret } from '@/integrations/telegram/webhook';
import type { Update } from '@/integrations/telegram/types';
import { asDbClient } from '@/lib/auth/session';
import { logger } from '@/lib/logger';
import {
  getOwnerBotToken,
  getOwnerBotWebhookSecret,
  isOwnerBotConfigured,
  OWNER_STORE_BOT_ID,
} from '@/lib/owner-bot';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { BotConnection } from '@/modules/bots/types';

function ownerConnection(secret: string): BotConnection {
  const now = new Date();
  return {
    id: OWNER_STORE_BOT_ID,
    tenantId: '',
    telegramBotId: OWNER_STORE_BOT_ID,
    username: 'owner_store',
    webhookSecret: secret,
    status: 'connected',
    lastHealthAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const secret = getOwnerBotWebhookSecret();
    const header = req.headers.get('x-telegram-bot-api-secret-token');
    if (secret === null || !verifyTelegramSecret(secret, header)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (!isOwnerBotConfigured()) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    const token = getOwnerBotToken();
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

    const db = asDbClient(createAdminSupabaseClient());
    enqueueTelegramUpdate(token, db, ownerConnection(secret), null, update);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
