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

export const PRODUCT_COLUMNS_BUYER = `${PRODUCT_LIST_COLUMNS}, buyer_category`;

export const PRODUCT_COLUMNS_FULL = `${PRODUCT_COLUMNS_BUYER}, duration_text, warranty_text, type_label, supplier_in_stock`;

/**
 * Picks the next column list when a migration has not been applied yet.
 * Card columns are dropped first so buyer_category still loads.
 */
export function productColumnsAfterError(previous: string, message: string): string | null {
  if (/supplier_in_stock/i.test(message) && previous.includes('supplier_in_stock')) {
    return previous.replace(', supplier_in_stock', '');
  }
  if (
    /duration_text|warranty_text|type_label/i.test(message) &&
    previous !== PRODUCT_COLUMNS_BUYER &&
    previous !== PRODUCT_LIST_COLUMNS
  ) {
    return PRODUCT_COLUMNS_BUYER;
  }
  if (/buyer_category/i.test(message) && previous !== PRODUCT_LIST_COLUMNS) {
    return PRODUCT_LIST_COLUMNS;
  }
  return null;
}

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
  let columns = PRODUCT_COLUMNS_FULL;
  let result = (await supabase.from('products').select(columns).in('id', unique)) as QueryResult<unknown[] | null>;
  let nextColumns = result.error ? productColumnsAfterError(columns, result.error.message) : null;
  while (nextColumns) {
    columns = nextColumns;
    result = (await supabase.from('products').select(columns).in('id', unique)) as QueryResult<unknown[] | null>;
    nextColumns = result.error ? productColumnsAfterError(columns, result.error.message) : null;
  }
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
