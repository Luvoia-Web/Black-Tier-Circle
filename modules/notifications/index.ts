/**
 * @file modules/notifications/index.ts
 *
 * In-app notifications. Creation never throws into the caller so a missing
 * table cannot fail payments, fulfillment, or wallet writes.
 *
 * @module Notifications
 */

import { logger } from '@/lib/logger';
import type { DbClient } from '@/lib/supabase/query';

export type NotificationType =
  | 'order_paid'
  | 'order_delivered'
  | 'order_failed'
  | 'wallet_credited'
  | 'wallet_debited'
  | 'balance_low'
  | 'product_added'
  | 'product_updated'
  | 'reseller_activated'
  | 'reseller_suspended'
  | 'supplier_synced'
  | 'system';

export type NotificationInput = {
  readonly userId: string;
  readonly tenantId?: string | null;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly metadata?: Record<string, unknown>;
};

export type NotificationItem = {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string | null;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly metadata: Record<string, unknown>;
  readonly isRead: boolean;
  readonly createdAt: string;
};

type NotificationRow = {
  readonly id: string;
  readonly user_id: string;
  readonly tenant_id: string | null;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly metadata: Record<string, unknown> | null;
  readonly is_read: boolean;
  readonly created_at: string;
};

function mapRow(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    type: row.type,
    title: row.title,
    body: row.body,
    metadata: row.metadata ?? {},
    isRead: row.is_read === true,
    createdAt: row.created_at,
  };
}

/**
 * Inserts one notification. Failures are logged and swallowed.
 */
export async function createNotification(supabase: DbClient, input: NotificationInput): Promise<void> {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: input.userId,
      tenant_id: input.tenantId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? {},
      is_read: false,
    });
    if (error) {
      logger.warn('notification insert skipped', { message: error.message });
    }
  } catch (error: unknown) {
    logger.warn('notification insert skipped', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Notifies every active reseller about a new catalog product.
 */
export async function notifyResellersOfProduct(
  supabase: DbClient,
  title: string,
  body: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const listed = await supabase.from('tenants').select('id, owner_user_id, status');
    const rows = Array.isArray(listed.data) ? listed.data : [];
    for (const raw of rows) {
      const row = raw as { id?: string; owner_user_id?: string; status?: string };
      if (!row.owner_user_id || row.status === 'suspended') {
        continue;
      }
      await createNotification(supabase, {
        userId: row.owner_user_id,
        tenantId: row.id ?? null,
        type: 'product_added',
        title,
        body,
        metadata,
      });
    }
  } catch (error: unknown) {
    logger.warn('product notifications skipped', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}

export async function listNotifications(
  supabase: DbClient,
  userId: string,
  filter: string,
): Promise<NotificationItem[]> {
  const result = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (result.error) {
    return [];
  }
  const rows = (Array.isArray(result.data) ? result.data : []) as NotificationRow[];
  return rows.map(mapRow).filter((item) => matchesFilter(item, filter));
}

export async function unreadNotificationCount(supabase: DbClient, userId: string): Promise<number> {
  const items = await listNotifications(supabase, userId, 'unread');
  return items.length;
}

function matchesFilter(item: NotificationItem, filter: string): boolean {
  if (filter === 'unread') {
    return !item.isRead;
  }
  if (filter === 'orders') {
    return item.type.startsWith('order_');
  }
  if (filter === 'wallet') {
    return item.type.startsWith('wallet_') || item.type === 'balance_low';
  }
  if (filter === 'system') {
    return item.type === 'system' || item.type === 'product_added' || item.type === 'reseller_activated' || item.type === 'reseller_suspended';
  }
  return true;
}

export function hrefForNotification(item: NotificationItem, role: 'owner' | 'reseller' | 'staff'): string {
  if (item.type.startsWith('order_') && typeof item.metadata.orderId === 'string') {
    return role === 'owner' ? `/owner/orders/${item.metadata.orderId}` : `/reseller/orders/${item.metadata.orderId}`;
  }
  if (item.type.startsWith('wallet_') || item.type === 'balance_low') {
    return role === 'owner' ? '/owner/wallets' : '/reseller/wallet';
  }
  if (item.type === 'product_added') {
    return role === 'owner' ? '/owner/products' : '/reseller/products';
  }
  return role === 'owner' ? '/owner' : '/reseller';
}
