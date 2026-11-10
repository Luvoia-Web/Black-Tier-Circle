/**
 * One customer-facing delivery message.
 * Wallet checkout edits this into the payment message.
 * The cron sends it only when that edit never landed.
 */

import { formatUsdt } from '@/lib/money';
import { logger } from '@/lib/logger';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getStoreConfig } from '@/modules/store-config';
import { renderTemplate } from '@/modules/store-config/template';

const inlineOrders = new Set<string>();
const inlineMessages = new Map<string, string>();

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function deliveredOrderText(input: {
  readonly title: string;
  readonly quantity: number;
  readonly amountMinor: bigint;
  readonly balanceMinor: bigint;
  readonly orderId: string;
  readonly content: string;
}): string {
  const content = esc(input.content.trim().slice(0, 3000));
  const body = content.length > 0 ? `\n\n<code>${content}</code>` : '';
  return (
    `✅ <b>Your order is delivered</b>\n\n` +
    `📦 ${esc(input.title)}\n` +
    `🔢 Quantity: ${input.quantity}\n` +
    `💵 Paid: ${esc(formatUsdt(input.amountMinor))}\n` +
    `💰 Remaining balance: <b>${esc(formatUsdt(input.balanceMinor))}</b>\n` +
    `🔖 Order: <code>${esc(input.orderId.slice(0, 8).toUpperCase())}</code>` +
    body
  );
}

export async function deliveryTextForOrder(
  supabase: DbClient,
  tenantId: string | null,
  input: Parameters<typeof deliveredOrderText>[0],
): Promise<string> {
  const fallback = deliveredOrderText(input);
  try {
    const stored = await getStoreConfig(supabase, tenantId);
    if (stored.source !== 'stored') {
      return fallback;
    }
    const rendered = renderTemplate(stored.config.messages.orderDelivered, {
      product: input.title,
      quantity: String(input.quantity),
      total: formatUsdt(input.amountMinor),
      balance: formatUsdt(input.balanceMinor),
      order: input.orderId.slice(0, 8).toUpperCase(),
      content: input.content,
      name: '',
      store: '',
      channel: '',
      group: '',
      website: '',
    }).trim();
    return rendered.length > 0 ? rendered : fallback;
  } catch (error: unknown) {
    logger.info('delivery template skipped', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return fallback;
  }
}

export function startInlineDelivery(orderId: string): void {
  inlineOrders.add(orderId);
}

export function isInlineDelivery(orderId: string): boolean {
  return inlineOrders.has(orderId);
}

export function noteInlineMessage(orderId: string, text: string): void {
  if (inlineOrders.has(orderId)) {
    inlineMessages.set(orderId, text);
  }
}

export function takeInlineMessage(orderId: string): string | null {
  inlineOrders.delete(orderId);
  const text = inlineMessages.get(orderId) ?? null;
  inlineMessages.delete(orderId);
  return text;
}

export async function saveDeliveryContent(supabase: DbClient, orderId: string, content: string): Promise<void> {
  const existing = (await supabase.from('orders').select('metadata').eq('id', orderId).maybeSingle()) as QueryResult<
    { metadata?: unknown } | null
  >;
  const current =
    existing.data?.metadata && typeof existing.data.metadata === 'object'
      ? (existing.data.metadata as Record<string, unknown>)
      : {};
  const { error } = await supabase
    .from('orders')
    .update({
      metadata: { ...current, deliveryContent: content.slice(0, 3500) },
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);
  if (error) {
    logger.info('delivery content save skipped', { orderId, message: error.message });
  }
}

export async function markCustomerNotified(supabase: DbClient, orderId: string): Promise<void> {
  const { claimTransition, getOrder } = await import('@/modules/orders');
  let order = await getOrder(supabase, orderId);
  if (order.deliveryStatus === 'sent') {
    return;
  }
  if (order.deliveryStatus === 'not_ready') {
    await claimTransition(supabase, orderId, 'delivery', 'not_ready', 'queued', {
      trigger: 'api',
      note: 'customer notified in chat',
    });
    order = await getOrder(supabase, orderId);
  }
  if (order.deliveryStatus === 'queued') {
    await claimTransition(supabase, orderId, 'delivery', 'queued', 'sending', {
      trigger: 'api',
      note: 'customer notified in chat',
    });
    order = await getOrder(supabase, orderId);
  }
  if (order.deliveryStatus === 'sending') {
    await claimTransition(supabase, orderId, 'delivery', 'sending', 'sent', {
      trigger: 'api',
      note: 'customer notified in chat',
    });
  }
}
