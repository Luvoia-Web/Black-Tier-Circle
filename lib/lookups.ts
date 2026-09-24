/**
 * @file lib/lookups.ts
 *
 * Batched lookups so dashboard APIs never query inside a loop.
 *
 * @module Lookups
 */

import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { mapProductRow } from '@/modules/catalog/map';
import type { Product } from '@/modules/catalog/types';

export const PRODUCT_LIST_COLUMNS =
  'id, sku, title, description, category, delivery_type, status, wholesale_price, retail_price, stock_unlimited, stock_count, reseller_eligible, max_purchase_qty, estimated_delivery_minutes, supplier_sku, supplier_id, supplier_price_minor, requires_email_activation, supplier_metadata, version, created_at, updated_at';

export type CustomerLookup = {
  readonly id: string;
  readonly username: string | null;
  readonly firstName: string | null;
  readonly telegramUserId: string;
};

/**
 * Loads products by id in a single query.
 */
export async function listProductsByIds(supabase: DbClient, ids: ReadonlyArray<string>): Promise<Map<string, Product>> {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  const map = new Map<string, Product>();
  if (unique.length === 0) {
    return map;
  }
  const result = (await supabase
    .from('products')
    .select(PRODUCT_LIST_COLUMNS)
    .in('id', unique)) as QueryResult<unknown[] | null>;
  if (!Array.isArray(result.data)) {
    return map;
  }
  for (const row of result.data) {
    const product = mapProductRow(row as Parameters<typeof mapProductRow>[0]);
    map.set(product.id, product);
  }
  return map;
}

/**
 * Loads customers by id in a single query.
 */
export async function listCustomersByIds(
  supabase: DbClient,
  ids: ReadonlyArray<string>,
): Promise<Map<string, CustomerLookup>> {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  const map = new Map<string, CustomerLookup>();
  if (unique.length === 0) {
    return map;
  }
  const result = (await supabase
    .from('customers')
    .select('id, username, first_name, telegram_user_id')
    .in('id', unique)) as QueryResult<unknown[] | null>;
  if (!Array.isArray(result.data)) {
    return map;
  }
  for (const raw of result.data) {
    const row = raw as {
      id: string;
      username: string | null;
      first_name: string | null;
      telegram_user_id: string;
    };
    map.set(row.id, {
      id: row.id,
      username: row.username,
      firstName: row.first_name,
      telegramUserId: row.telegram_user_id,
    });
  }
  return map;
}

/**
 * Customer label used in order tables.
 */
export function customerLabel(customer: CustomerLookup | undefined, fallbackId: string | null): string {
  if (!customer) {
    return fallbackId ? fallbackId.slice(0, 8) : 'Direct';
  }
  if (customer.username) {
    return `@${customer.username}`;
  }
  if (customer.firstName) {
    return customer.firstName;
  }
  return customer.telegramUserId;
}
