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

export const DEFAULT_OWNER_BOT_NAME = 'Owner bot';

/**
 * Unified owner bot display name across Bots, System health, and Bot Studio.
 */
export function ownerBotDisplayName(username?: string | null): string {
  const clean = typeof username === 'string' ? username.trim().replace(/^@+/, '') : '';
  return clean.length > 0 ? `@${clean}` : DEFAULT_OWNER_BOT_NAME;
}

export type BotLiveStatus = 'Online' | 'Idle' | 'Offline' | 'Paused';

export type BotLiveStatusInput = {
  readonly storedStatus: string;
  readonly paused?: boolean;
  readonly decryptFailed?: boolean;
  readonly tokenValid?: boolean | null;
  readonly webhookSet?: boolean | null;
  readonly webhookError?: string | null;
  /** ISO timestamp of the newest Telegram update / buyer activity / order for this bot. */
  readonly lastUpdateAt?: string | null;
  readonly now?: Date;
  readonly decryptErrorMessage?: string;
};

export type BotLiveStatusResult = {
  readonly status: BotLiveStatus;
  readonly tone: 'ok' | 'warn' | 'fault' | 'neutral';
  readonly detail: string | null;
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Single source of truth for bot status:
 * - "Online": webhook healthy AND an update received in the last 24h.
 * - "Idle": webhook healthy, no update received in the last 24h.
 * - "Paused": paused from the dashboard.
 * - "Offline": disconnected, token unreadable/invalid, webhook missing or erroring.
 */
export function resolveBotLiveStatus(input: BotLiveStatusInput): BotLiveStatusResult {
  if (input.decryptFailed) {
    return {
      status: 'Offline',
      tone: 'fault',
      detail: input.decryptErrorMessage ?? 'Bot token could not be decrypted. Reconnect the bot.',
    };
  }
  if (input.paused || input.storedStatus === 'paused') {
    return {
      status: 'Paused',
      tone: 'warn',
      detail: 'Paused from the dashboard.',
    };
  }
  if (
    input.storedStatus === 'disconnected' ||
    input.storedStatus === 'error' ||
    input.tokenValid === false ||
    input.webhookSet === false ||
    Boolean(input.webhookError)
  ) {
    const detail = input.webhookError
      ? input.webhookError
      : input.storedStatus === 'disconnected'
        ? 'Disconnected. Connect the bot to start receiving updates.'
        : input.webhookSet === false
          ? 'Webhook is not registered with Telegram.'
          : 'Telegram rejected the token or reported a webhook error.';
    return { status: 'Offline', tone: 'fault', detail };
  }

  const nowMs = (input.now ?? new Date()).getTime();
  const updateMs = input.lastUpdateAt ? Date.parse(input.lastUpdateAt) : Number.NaN;
  const recentUpdate = Number.isFinite(updateMs) && nowMs - updateMs <= TWENTY_FOUR_HOURS_MS && nowMs - updateMs >= -60_000;
  if (recentUpdate) {
    return { status: 'Online', tone: 'ok', detail: 'Webhook healthy · update received in the last 24h' };
  }
  return { status: 'Idle', tone: 'warn', detail: 'Webhook healthy · no update in the last 24h' };
}
