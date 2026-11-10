/**
 * Units sold for a product: sum of quantity on verified orders.
 * Owner store counts orders with no tenant. A reseller counts only that tenant.
 * A failed query returns null so the card can hide the line.
 */

import type { DbClient, QueryResult } from '@/lib/supabase/query';

type SoldRow = {
  readonly product_id?: string;
  readonly quantity?: number | string | null;
  readonly payment_status?: string;
  readonly tenant_id?: string | null;
};

export async function loadSoldCounts(
  supabase: DbClient,
  productIds: readonly string[],
  tenantId: string | null,
): Promise<Map<string, number> | null> {
  const ids = [...new Set(productIds.filter((id) => id.length > 0))];
  const counts = new Map<string, number>();
  if (ids.length === 0) {
    return counts;
  }
  const result = (await supabase
    .from('orders')
    .select('product_id, quantity, payment_status, tenant_id')
    .in('product_id', ids)) as QueryResult<SoldRow[] | null>;
  if (result.error || !Array.isArray(result.data)) {
    return null;
  }
  for (const row of result.data) {
    if (row.payment_status !== 'verified' || !row.product_id) {
      continue;
    }
    const rowTenant = row.tenant_id ?? null;
    if (tenantId === null ? rowTenant !== null : rowTenant !== tenantId) {
      continue;
    }
    const quantity = Number(row.quantity ?? 1);
    const units = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
    counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + units);
  }
  for (const id of ids) {
    if (!counts.has(id)) {
      counts.set(id, 0);
    }
  }
  return counts;
}
