/**
 * @file app/api/webhooks/telegram/[botId]/route.ts
 *
 * Telegram webhook stub.
 *
 * Phase 0 acknowledges updates so bots can be pointed at this URL.
 * Secret-token enforcement and grammY processing start in Phase 4.
 *
 * @module Api
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

type RouteContext = {
  readonly params: { readonly botId: string };
};

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  // SECURITY: X-Telegram-Bot-Api-Secret-Token is checked from Phase 4.
  const hasSecretHeader = request.headers.has('x-telegram-bot-api-secret-token');
  logger.info('telegram webhook received', {
    botId: context.params.botId,
    hasSecretHeader,
  });
  return NextResponse.json({ ok: true });
}
