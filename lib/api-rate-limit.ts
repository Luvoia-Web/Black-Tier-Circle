/**
 * Classifies an API request and applies the shared rate limit.
 * Auth and money fail closed. Reads fail open. Other writes fail closed
 * unless rate_limit_hits is missing, so an unapplied 0032 does not stop the dashboard.
 */

import { NextResponse } from 'next/server';
import { consumeRateLimit, type RateLimitFail } from '@/lib/rate-limiter';
import { clientIp } from '@/lib/request-rate-limit';

type LimitKind = 'auth' | 'money' | 'write' | 'read' | 'cron' | 'skip';

function kindOf(pathname: string, method: string): LimitKind {
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return 'skip';
  if (/^\/api\/(fulfillment\/process|supplier\/reconcile|supplier\/sync|bots\/health|platform\/broadcasts\/process)(\/|$)/.test(pathname)) return 'cron';
  if (/^\/api\/(auth|invitations|onboarding)(\/|$)/.test(pathname) || pathname.includes('/profile/password')) return 'auth';
  if (/\/(wallet|payments|topups|refund|redeem|tokens|binance|bep20|credit|debit)(\/|$)/.test(pathname)) return 'money';
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') return 'write';
  return 'read';
}

function failFor(kind: LimitKind): RateLimitFail {
  if (kind === 'read' || kind === 'cron') return 'open';
  return 'closed';
}

/**
 * Returns a 429 response when the request is over the limit. Otherwise null.
 */
export async function limitApiRequest(request: Request): Promise<NextResponse | null> {
  const url = new URL(request.url);
  const kind = kindOf(url.pathname, request.method);
  if (kind === 'skip') return null;
  const limit = kind === 'auth' ? 20 : kind === 'cron' ? 30 : 120;
  const result = await consumeRateLimit({
    key: `api:${kind}:${request.method}:${url.pathname}:${clientIp(request)}`,
    limit,
    fail: failFor(kind),
  });
  if (result.needsMigration && kind === 'write') return null;
  if (result.allowed) return null;
  const message = result.needsMigration
    ? 'This action needs migration 0032.'
    : 'Too many requests. Please wait and try again.';
  return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message } }, { status: 429 });
}

export type TelegramRateLimitUpdate = {
  readonly message?: { readonly from?: { readonly id?: number } };
  readonly edited_message?: { readonly from?: { readonly id?: number } };
  readonly callback_query?: { readonly from?: { readonly id?: number } };
  readonly inline_query?: { readonly from?: { readonly id?: number } };
  readonly channel_post?: { readonly chat?: { readonly id?: number } };
  readonly edited_channel_post?: { readonly chat?: { readonly id?: number } };
};

export function telegramChannelChatId(update: TelegramRateLimitUpdate): string | null {
  const id = update.channel_post?.chat?.id ?? update.edited_channel_post?.chat?.id;
  return typeof id === 'number' && Number.isFinite(id) ? String(id) : null;
}

/**
 * Per-customer / per-channel Telegram limit.
 * Refuses updates that have neither a sender user id nor a known channel_post chat id.
 */
export async function limitTelegramUpdate(
  botId: string,
  update: TelegramRateLimitUpdate,
): Promise<NextResponse | null> {
  const userId = telegramUserId(update);
  if (userId) {
    const result = await consumeRateLimit({ key: `tg-user:${botId}:${userId}`, limit: 40, fail: 'closed' });
    if (result.allowed || result.needsMigration) return null;
    return NextResponse.json({ ok: false, description: 'Rate limit exceeded' }, { status: 429 });
  }
  const channelChatId = telegramChannelChatId(update);
  if (channelChatId) {
    const result = await consumeRateLimit({ key: `tg-chat:${botId}:${channelChatId}`, limit: 40, fail: 'closed' });
    if (result.allowed || result.needsMigration) return null;
    return NextResponse.json({ ok: false, description: 'Rate limit exceeded' }, { status: 429 });
  }
  return NextResponse.json({ ok: false, description: 'Update missing sender user id' }, { status: 400 });
}

/**
 * Per-customer Telegram limit. A missing rate_limit_hits table does not stop the bot.
 */
export async function limitTelegramCustomer(botId: string, userId: string | null): Promise<NextResponse | null> {
  if (!userId) {
    return NextResponse.json({ ok: false, description: 'Update missing sender user id' }, { status: 400 });
  }
  const result = await consumeRateLimit({ key: `tg-user:${botId}:${userId}`, limit: 40, fail: 'closed' });
  if (result.allowed || result.needsMigration) return null;
  return NextResponse.json({ ok: false, description: 'Rate limit exceeded' }, { status: 429 });
}

export function telegramUserId(update: TelegramRateLimitUpdate): string | null {
  const id = update.callback_query?.from?.id
    ?? update.message?.from?.id
    ?? update.edited_message?.from?.id
    ?? update.inline_query?.from?.id;
  return typeof id === 'number' ? String(id) : null;
}
