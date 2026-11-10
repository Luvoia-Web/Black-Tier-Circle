/**
 * One-time "balance added" note for an order the buyer asked to resume.
 * This only writes orders.metadata. It does not credit or debit a wallet.
 */

import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { CHECKOUT_WINDOW_MS } from '@/modules/orders/checkout';

const claimed = new Set<string>();

type NoticeRow = {
  readonly id?: string;
  readonly customer_id?: string;
  readonly product_id?: string;
  readonly payment_status?: string;
  readonly created_at?: string;
  readonly metadata?: unknown;
};

export type BalanceNotice =
  | { readonly kind: 'resume'; readonly orderId: string }
  | { readonly kind: 'expired'; readonly orderId: string; readonly productId: string }
  | { readonly kind: 'skip' };

function metaOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

function openPayment(status: string | undefined): boolean {
  return status === 'awaiting' || status === 'pending_verification';
}

export async function markResumeAfterTopup(supabase: DbClient, orderId: string): Promise<void> {
  const existing = (await supabase.from('orders').select('metadata').eq('id', orderId).maybeSingle()) as QueryResult<
    NoticeRow | null
  >;
  if (existing.error || !existing.data) {
    return;
  }
  const metadata = metaOf(existing.data.metadata);
  if (metadata.resume_after_topup === true) {
    return;
  }
  await supabase
    .from('orders')
    .update({ metadata: { ...metadata, resume_after_topup: true }, updated_at: new Date().toISOString() })
    .eq('id', orderId);
}

/**
 * Claims the resume message for the newest top-up the buyer started.
 * A second call, including a duplicate callback, returns skip.
 */
export async function claimCheckoutResume(
  supabase: DbClient,
  customerId: string,
  now: Date = new Date(),
): Promise<BalanceNotice> {
  const result = (await supabase
    .from('orders')
    .select('id, customer_id, product_id, payment_status, created_at, metadata')
    .eq('customer_id', customerId)) as QueryResult<NoticeRow[] | null>;
  if (result.error || !Array.isArray(result.data)) {
    return { kind: 'skip' };
  }
  const waiting = result.data
    .filter((row) => {
      const metadata = metaOf(row.metadata);
      return row.id && metadata.resume_after_topup === true && metadata.balance_added_notice === undefined;
    })
    .sort((left, right) => String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')));
  const order = waiting[0];
  if (!order?.id || claimed.has(order.id)) {
    return { kind: 'skip' };
  }
  claimed.add(order.id);
  const created = order.created_at ? new Date(order.created_at).getTime() : 0;
  const expired = !openPayment(order.payment_status) || now.getTime() - created > CHECKOUT_WINDOW_MS;
  const metadata = {
    ...metaOf(order.metadata),
    balance_added_notice: expired ? 'expired' : 'sent',
  };
  const saved = await supabase
    .from('orders')
    .update({ metadata, updated_at: now.toISOString() })
    .eq('id', order.id);
  if (saved.error) {
    claimed.delete(order.id);
    return { kind: 'skip' };
  }
  if (expired) {
    return { kind: 'expired', orderId: order.id, productId: order.product_id ?? '' };
  }
  return { kind: 'resume', orderId: order.id };
}
