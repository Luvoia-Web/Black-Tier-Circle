/**
 * @file modules/supplier/poll.ts
 *
 * Polls suppliers for activation orders that were not delivered instantly,
 * bounded by batch limit and time budget.
 */

import { CRON_BATCH_LIMITS, createCronBudget } from '@/lib/cron-budget';
import { logger } from '@/lib/logger';
import type { DbClient } from '@/lib/supabase/query';
import { getOrder } from '@/modules/orders';
import { settlePolledSupplierOrder } from '@/modules/fulfillment';
import { adapterByName } from '@/integrations/supplier/supplier-client';
import { decrypt } from '@/lib/encryption';
import { loadSupplierClient, supplierOrderIdFromArtifact } from './place';

export async function pollPendingSupplierOrders(
  supabase: DbClient,
  options: { readonly batchLimit?: number; readonly timeBudgetMs?: number } = {},
): Promise<{
  polled: number;
  delivered: number;
  failed: number;
  stillPending: number;
  truncated: boolean;
  durationMs: number;
}> {
  const batchLimit = Math.max(1, options.batchLimit ?? CRON_BATCH_LIMITS.reconcilePollOrders);
  const budget = createCronBudget(options.timeBudgetMs ?? 8_000);
  const { data, error } = await supabase
    .from('fulfillment_attempts')
    .select('id, order_id, artifact_path, status, started_at')
    .eq('method', 'supplier')
    .eq('status', 'pending');
  if (error) {
    logger.error('supplier poll lookup failed', { message: error.message });
    return { polled: 0, delivered: 0, failed: 0, stillPending: 0, truncated: false, durationMs: budget.elapsedMs() };
  }
  let polled = 0;
  let delivered = 0;
  let failed = 0;
  let stillPending = 0;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const eligible = (
    (data ?? []) as Array<{
      id: string;
      order_id: string;
      artifact_path: string | null;
      started_at?: string;
    }>
  )
    .filter((row) => {
      if (typeof row.artifact_path !== 'string' || !row.artifact_path.startsWith('supplier_order:')) {
        return false;
      }
      const started = row.started_at ? new Date(row.started_at).getTime() : Date.now();
      return started >= cutoff;
    })
    .sort((left, right) => Date.parse(left.started_at ?? '') - Date.parse(right.started_at ?? ''));

  const batch = eligible.slice(0, batchLimit);
  let truncated = eligible.length > batchLimit;

  for (const row of batch) {
    if (!budget.hasTime(500)) {
      truncated = true;
      break;
    }
    polled += 1;
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
      const supplierRow = await supabase.from('suppliers').select('adapter_name, api_key_encrypted, base_url').eq('id', supplierId).maybeSingle();
      const saved = supplierRow.data as { adapter_name?: string; api_key_encrypted?: string | null; base_url?: string } | null;
      const remote =
        saved?.adapter_name === 'canboso' && saved.api_key_encrypted
          ? await adapterByName('canboso')
              .getOrderStatus(decrypt(saved.api_key_encrypted), supplierOrderId, saved.base_url)
              .then((result) => ({
                status: result.status,
                deliveredKeys: result.deliveredContent ? [result.deliveredContent] : undefined,
                deliveredKey: result.deliveredContent,
              }))
          : await (await loadSupplierClient(supabase, supplierId)).getOrder(supplierOrderId);
      if (remote.status === 'delivered') {
        const content = remote.deliveredKeys?.join('\n') || remote.deliveredKey || `Subscription activated for ${title}`;
        await settlePolledSupplierOrder(supabase, order.id, row.id, { status: 'delivered', content });
        delivered += 1;
      } else if (remote.status === 'failed') {
        await settlePolledSupplierOrder(supabase, order.id, row.id, {
          status: 'failed',
          reason: `Supplier order ${supplierOrderId} failed`,
        });
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
  return { polled, delivered, failed, stillPending, truncated, durationMs: budget.elapsedMs() };
}
