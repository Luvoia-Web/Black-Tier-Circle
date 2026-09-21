/**
 * @file modules/bots/index.ts
 *
 * Bot connection public API. Tokens are never returned.
 *
 * @module Bots
 */

import type { BotConnection } from './types';

export type { BotConnection, BotConnectionStatus } from './types';

/**
 * Returns a disconnected sandbox bot for a tenant.
 *
 * @param tenantId - Session-derived tenant id
 * @returns Sandbox bot connection without token material
 */
export function getSandboxBot(tenantId: string): BotConnection {
  return {
    id: '00000000-0000-4000-8000-000000000201',
    tenantId,
    telegramBotId: '0',
    username: 'sandbox_reseller_bot',
    status: 'disconnected',
  };
}
