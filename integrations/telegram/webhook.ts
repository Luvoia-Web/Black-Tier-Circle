/**
 * @file integrations/telegram/webhook.ts
 *
 * Shared webhook secret verification and async update processing.
 *
 * @module Telegram
 */

import { timingSafeEqual } from 'node:crypto';
import { decrypt } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { OWNER_STORE_BOT_ID } from '@/lib/owner-bot';
import type { DbClient } from '@/lib/supabase/query';
import type { BotConnection } from '@/modules/bots/types';
import { createBotEngine } from './client';
import type { Update } from './types';

/**
 * Compares the Telegram secret-token header with the stored secret.
 *
 * @param expected - Stored webhook_secret
 * @param provided - X-Telegram-Bot-Api-Secret-Token header
 */
export function verifyTelegramSecret(expected: string, provided: string | null): boolean {
  if (provided === null || expected.length === 0) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Handles a Telegram update on the webhook request so Vercel does not freeze the work after 200.
 *
 * @param botToken - Decrypted token (never log)
 * @param supabase - Service-role client
 * @param botConnection - Public connection fields
 * @param tenantId - Reseller tenant or null for owner store
 * @param update - Telegram update
 */
export async function processTelegramUpdate(
  botToken: string,
  supabase: DbClient,
  botConnection: BotConnection,
  tenantId: string | null,
  update: Update,
): Promise<void> {
  const engine = createBotEngine(botToken, { supabase, botConnection, tenantId });
  // #region agent log
  fetch('http://127.0.0.1:7919/ingest/7ddaa35c-0c58-42f6-8e24-2b102fb80347',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5914e5'},body:JSON.stringify({sessionId:'5914e5',hypothesisId:'H5',location:'webhook.ts:enqueue',message:'processUpdate awaited',data:{updateId:update.update_id,tenantNull:tenantId===null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  try {
    await engine.processUpdate(update);
  } catch (error: unknown) {
    // #region agent log
    fetch('http://127.0.0.1:7919/ingest/7ddaa35c-0c58-42f6-8e24-2b102fb80347',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5914e5'},body:JSON.stringify({sessionId:'5914e5',hypothesisId:'H4',location:'webhook.ts:enqueue-catch',message:'processUpdate rejected',data:{updateId:update.update_id,errorMessage:error instanceof Error?error.message:'unknown'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    logger.error('telegram background processing failed', {
      botId: botConnection.id === OWNER_STORE_BOT_ID ? OWNER_STORE_BOT_ID : botConnection.id,
      update_id: update.update_id,
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Decrypts a stored token for the bot engine.
 * SECURITY: never log the return value.
 *
 * @param encryptedToken - Ciphertext from bot_connections
 */
export function decryptBotToken(encryptedToken: string): string {
  return decrypt(encryptedToken);
}
