/**
 * @file lib/owner-bot.ts
 *
 * Owner's own store bot — configured via env vars, not the DB.
 * Uses the same bot engine as reseller bots but with tenantId=null.
 * Products shown are all published products (not filtered by reseller listing).
 * Prices shown are retail_price from the products table.
 *
 * TODO(phase-9): Add webhook registration for owner bot at startup
 */

/** Sentinel bot connection id used for owner-store customers and webhooks. */
export const OWNER_STORE_BOT_ID = 'owner';

/**
 * Returns whether the owner store bot token is configured (not a placeholder).
 */
export function isOwnerBotConfigured(): boolean {
  return !!(
    process.env.OWNER_BOT_TOKEN &&
    !process.env.OWNER_BOT_TOKEN.startsWith('PLACEHOLDER')
  );
}

/**
 * Returns the owner bot webhook secret, or null when unset.
 */
export function getOwnerBotWebhookSecret(): string | null {
  const secret = process.env.OWNER_BOT_WEBHOOK_SECRET;
  if (!secret || secret.length === 0) {
    return null;
  }
  return secret;
}

/**
 * Returns the owner bot token, or null when not configured.
 * SECURITY: Caller must never log or return this value.
 */
export function getOwnerBotToken(): string | null {
  if (!isOwnerBotConfigured()) {
    return null;
  }
  return process.env.OWNER_BOT_TOKEN ?? null;
}
