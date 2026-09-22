/**
 * @file lib/owner-bot.ts
 *
 * Owner store bot identity. The token and webhook secret live in platform_settings
 * and are loaded with getDecryptedOwnerBotToken / getOwnerBotWebhookSecret.
 *
 * @module OwnerBot
 */

/** Sentinel bot connection id used for owner-store customers and webhooks. */
export const OWNER_STORE_BOT_ID = 'owner';
