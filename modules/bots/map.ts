/**
 * @file modules/bots/map.ts
 *
 * Maps bot_connections and customers rows to domain types.
 *
 * @module Bots
 */

import { OWNER_STORE_BOT_ID } from '@/lib/owner-bot';
import type {
  BotConnection,
  BotConnectionRow,
  BotConnectionStatus,
  BotConnectionWithToken,
  CustomerRecord,
  CustomerRow,
} from './types';

function asStatus(value: string): BotConnectionStatus {
  if (value === 'connected' || value === 'disconnected' || value === 'error') {
    return value;
  }
  return 'error';
}

/**
 * Maps a bot_connections row without exposing the encrypted token.
 *
 * @param row - Database row
 */
export function mapBotConnectionRow(row: BotConnectionRow): BotConnection {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    telegramBotId: row.telegram_bot_id,
    username: row.username,
    webhookSecret: row.webhook_secret,
    status: asStatus(row.status),
    lastHealthAt: row.last_health_at ? new Date(row.last_health_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Maps a bot_connections row including the encrypted token for internal use.
 *
 * @param row - Database row
 */
export function mapBotConnectionWithToken(row: BotConnectionRow): BotConnectionWithToken {
  return {
    ...mapBotConnectionRow(row),
    encryptedToken: row.encrypted_token,
  };
}

/**
 * Maps a customers row.
 *
 * @param row - Database row
 */
export function mapCustomerRow(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    botId: row.bot_id ?? OWNER_STORE_BOT_ID,
    telegramUserId: row.telegram_user_id,
    telegramChatId: row.telegram_chat_id,
    firstName: row.first_name,
    username: row.username,
    isBlocked: row.is_blocked,
    creditBalanceMinor:
      row.credit_balance === undefined || row.credit_balance === null ? 0n : BigInt(row.credit_balance),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
