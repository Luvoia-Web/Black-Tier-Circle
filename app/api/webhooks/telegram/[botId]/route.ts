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
import { decryptBotToken, processTelegramUpdate, verifyTelegramSecret } from '@/integrations/telegram/webhook';
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
    // #region agent log
    fetch('http://127.0.0.1:7919/ingest/7ddaa35c-0c58-42f6-8e24-2b102fb80347',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5914e5'},body:JSON.stringify({sessionId:'5914e5',hypothesisId:'H2',location:'webhooks/telegram/[botId]/route.ts:entry',message:'webhook hit',data:{botIdPresent:typeof params.botId==='string'&&params.botId.length>0,botIdLooksUuid:/^[0-9a-f-]{36}$/i.test(params.botId??''),hasSecretHeader:header!==null&&header.length>0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const db = asDbClient(createAdminSupabaseClient());
    const connection = await getBotConnectionById(db, params.botId);
    if (!verifyTelegramSecret(connection.webhookSecret, header)) {
      // #region agent log
      fetch('http://127.0.0.1:7919/ingest/7ddaa35c-0c58-42f6-8e24-2b102fb80347',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5914e5'},body:JSON.stringify({sessionId:'5914e5',hypothesisId:'H3',location:'webhooks/telegram/[botId]/route.ts:secret',message:'secret rejected',data:{storedSecretLength:connection.webhookSecret.length,headerLength:header?.length??0,status:connection.status},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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

    let token: string;
    try {
      token = decryptBotToken(connection.encryptedToken);
    } catch (error: unknown) {
      // #region agent log
      fetch('http://127.0.0.1:7919/ingest/7ddaa35c-0c58-42f6-8e24-2b102fb80347',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5914e5'},body:JSON.stringify({sessionId:'5914e5',hypothesisId:'H3',location:'webhooks/telegram/[botId]/route.ts:decrypt',message:'token decrypt failed',data:{errorName:error instanceof Error?error.name:'unknown',errorMessage:error instanceof Error?error.message:'unknown'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw error;
    }
    // #region agent log
    fetch('http://127.0.0.1:7919/ingest/7ddaa35c-0c58-42f6-8e24-2b102fb80347',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5914e5'},body:JSON.stringify({sessionId:'5914e5',hypothesisId:'H5',location:'webhooks/telegram/[botId]/route.ts:accepted',message:'update accepted, enqueueing',data:{updateId:update.update_id??0,type:updateKind(update),isStart:update.message?.text?.trim().startsWith('/start')===true,tenantPresent:connection.tenantId.length>0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    await processTelegramUpdate(token, db, connection, connection.tenantId, update);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    // #region agent log
    fetch('http://127.0.0.1:7919/ingest/7ddaa35c-0c58-42f6-8e24-2b102fb80347',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5914e5'},body:JSON.stringify({sessionId:'5914e5',hypothesisId:'H2',location:'webhooks/telegram/[botId]/route.ts:catch',message:'webhook handler threw',data:{errorName:error instanceof Error?error.name:'unknown',errorMessage:error instanceof Error?error.message:'unknown',errorCode:typeof error==='object'&&error!==null&&'code' in error?String((error as {code:unknown}).code):''},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
