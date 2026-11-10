import { decrypt } from '@/lib/encryption';
import { AppError } from '@/lib/errors';
import type { DbClient } from '@/lib/supabase/query';
import { telegramSendHtml } from '@/integrations/telegram/api';
import { getBotConnectionById } from '@/modules/bots';
import { OWNER_STORE_BOT_ID } from '@/lib/owner-bot';
import { getDecryptedOwnerBotToken } from '@/modules/platform';

async function tokenForBot(supabase: DbClient, botId: string | null): Promise<string> {
  if (!botId || botId === OWNER_STORE_BOT_ID) {
    const token = await getDecryptedOwnerBotToken(supabase);
    if (!token) {
      throw new AppError('BOT_TOKEN_MISSING', 'The store bot is not connected', 500);
    }
    return token;
  }
  const connection = await getBotConnectionById(supabase, botId);
  return decrypt(connection.encryptedToken);
}

/**
 * Sends a notice to one customer. Throws when delivery fails so the caller can retry.
 */
export async function deliverReferralNotice(
  supabase: DbClient,
  customerId: string,
  html: string,
): Promise<void> {
  const { data, error } = await supabase.from('customers').select('telegram_chat_id, bot_id').eq('id', customerId).maybeSingle();
  if (error || !data) {
    throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
  }
  const row = data as { telegram_chat_id?: string | null; bot_id?: string | null };
  const chatId = row.telegram_chat_id ?? '';
  if (!chatId) {
    throw new AppError('CUSTOMER_CHAT_MISSING', 'Customer has no chat', 500);
  }
  const token = await tokenForBot(supabase, row.bot_id ?? null);
  await telegramSendHtml(token, chatId, html);
}
