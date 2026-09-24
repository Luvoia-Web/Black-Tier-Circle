/**
 * @file modules/supplier/poll.ts
 *
 * Polls ProdSeller for activation orders that were not delivered instantly.
 */

import { logger } from '@/lib/logger';
import type { DbClient } from '@/lib/supabase/query';
import { getOrder } from '@/modules/orders';
import { deliverSupplierContent } from '@/modules/fulfillment';
import { loadSupplierClient, supplierOrderIdFromArtifact } from './place';

export async function pollPendingSupplierOrders(
  supabase: DbClient,
): Promise<{ polled: number; delivered: number; failed: number; stillPending: number }> {
  const { data, error } = await supabase
    .from('fulfillment_attempts')
    .select('id, order_id, artifact_path, status')
    .eq('status', 'pending');
  if (error) {
    logger.error('supplier poll lookup failed', { message: error.message });
    return { polled: 0, delivered: 0, failed: 0, stillPending: 0 };
  }
  let delivered = 0;
  let failed = 0;
  let stillPending = 0;
  const rows = ((data ?? []) as Array<{ id: string; order_id: string; artifact_path: string | null; status?: string }>).filter(
    (row) => typeof row.artifact_path === 'string' && row.artifact_path.startsWith('supplier_order:'),
  );
  for (const row of rows) {
    const supplierOrderId = supplierOrderIdFromArtifact(row.artifact_path);
    if (!supplierOrderId) {
      stillPending += 1;
      continue;
    }
    try {
      const order = await getOrder(supabase, row.order_id);
      const product = await supabase.from('products').select('supplier_id, title').eq('id', order.productId).maybeSingle();
      const supplierId = (product.data as { supplier_id?: string; title?: string } | null)?.supplier_id;
      const title = (product.data as { title?: string } | null)?.title ?? 'Product';
      if (!supplierId) {
        stillPending += 1;
        continue;
      }
      const client = await loadSupplierClient(supabase, supplierId);
      const remote = await client.getOrder(supplierOrderId);
      if (remote.status === 'delivered') {
        const content = remote.deliveredKeys?.join('\n') || remote.deliveredKey || `Subscription activated for ${title}`;
        await supabase
          .from('fulfillment_attempts')
          .update({ status: 'success', completed_at: new Date().toISOString() })
          .eq('id', row.id);
        await deliverSupplierContent(supabase, order, content);
        delivered += 1;
      } else if (remote.status === 'failed') {
        await supabase
          .from('fulfillment_attempts')
          .update({ status: 'failed', error: 'Supplier order failed', completed_at: new Date().toISOString() })
          .eq('id', row.id);
        failed += 1;
      } else {
        stillPending += 1;
      }
    } catch (pollError: unknown) {
      logger.error('supplier poll failed', {
        orderId: row.order_id,
        message: pollError instanceof Error ? pollError.message : 'unknown',
      });
      stillPending += 1;
    }
  }
  return { polled: rows.length, delivered, failed, stillPending };
}
