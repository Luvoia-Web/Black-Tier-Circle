/**
 * @file app/api/owner/orders/route.ts
 *
 * GET, owner only. Paginated orders with all four status tracks.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listProductsByIds } from '@/lib/lookups';
import { formatUsdt } from '@/lib/money';
import { pageMeta, parsePageParams } from '@/lib/pagination';
import {
  isManualFulfillmentOverdue,
  matchesOwnerOrderTab,
  type OwnerOrderTab,
} from '@/modules/fulfillment';
import { listOrders } from '@/modules/orders';

export const dynamic = 'force-dynamic';

function asTab(value: string | null): OwnerOrderTab {
  if (
    value === 'all' ||
    value === 'awaiting_payment' ||
    value === 'pending_fulfillment' ||
    value === 'manual_pending' ||
    value === 'completed' ||
    value === 'failed'
  ) {
    return value;
  }
  return 'all';
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const url = new URL(request.url);
    const tab = asTab(url.searchParams.get('tab'));
    const { page, limit } = parsePageParams(url.searchParams, { limit: 20 });
    const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const store = url.searchParams.get('store') ?? 'all';
    const tenantFilter = url.searchParams.get('tenant') ?? 'all';
    const supplierFilter = url.searchParams.get('supplier') ?? 'all';
    const db = asDbClient(session.admin);
    const orders = await listOrders(db, { limit: 200 });
    const products = await listProductsByIds(
      db,
      orders.map((order) => order.productId),
    );
    const supplierIds = [...new Set([...products.values()].map((product) => product.supplierId).filter((id): id is string => Boolean(id)))];
    const tenantIds = [...new Set(orders.map((order) => order.tenantId).filter((id): id is string => Boolean(id)))];
    const supplierNames = new Map<string, string>();
    if (supplierIds.length > 0) {
      const supplierRows = await db.from('suppliers').select('id, name').in('id', supplierIds);
      for (const raw of Array.isArray(supplierRows.data) ? supplierRows.data : []) {
        const row = raw as { id?: string; name?: string };
        if (row.id && row.name) {
          supplierNames.set(row.id, row.name);
        }
      }
    }
    const tenantNames = new Map<string, string>();
    if (tenantIds.length > 0) {
      const tenantRows = await db.from('tenants').select('id, display_name').in('id', tenantIds);
      for (const raw of Array.isArray(tenantRows.data) ? tenantRows.data : []) {
        const row = raw as { id?: string; display_name?: string };
        if (row.id && row.display_name) {
          tenantNames.set(row.id, row.display_name);
        }
      }
    }
    const enriched = orders.map((order) => {
      const product = products.get(order.productId);
      const supplierName = product?.supplierId ? supplierNames.get(product.supplierId) ?? 'Supplier API' : null;
      const mine = order.channel === 'owner_store' || order.tenantId === null;
      return {
        order,
        productTitle: product?.title ?? order.productId.slice(0, 8).toUpperCase(),
        sourceLabel: supplierName ?? 'Own Product',
        sourceKind: supplierName ? 'supplier' : 'own',
        channelLabel: mine ? 'Owner Store' : tenantNames.get(order.tenantId ?? '') ?? 'Reseller',
        tenantId: order.tenantId,
        mine,
      };
    });
    const filtered = enriched.filter((row) => {
      if (!matchesOwnerOrderTab(row.order, tab)) {
        return false;
      }
      if (store === 'mine' && !row.mine) {
        return false;
      }
      if (store === 'resellers' && row.mine) {
        return false;
      }
      if (tenantFilter === 'owner' && !row.mine) {
        return false;
      }
      if (tenantFilter !== 'all' && tenantFilter !== 'owner' && row.tenantId !== tenantFilter) {
        return false;
      }
      if (supplierFilter === 'own' && row.sourceKind !== 'own') {
        return false;
      }
      if (supplierFilter !== 'all' && supplierFilter !== 'own' && row.sourceLabel !== supplierFilter) {
        return false;
      }
      if (query.length === 0) {
        return true;
      }
      return (
        row.order.id.replaceAll('-', '').toLowerCase().startsWith(query.replaceAll('-', '')) ||
        row.order.id.slice(0, 8).toLowerCase().includes(query)
      );
    });
    const start = (page - 1) * limit;
    const pageRows = filtered.slice(start, start + limit);
    const rows = pageRows.map((row) => ({
      orderId: row.order.id,
      channel: row.channelLabel,
      source: row.sourceLabel,
      productTitle: row.productTitle,
      amount: formatUsdt(row.order.quotedRetailPriceMinor),
      paymentStatus: row.order.paymentStatus,
      fundingStatus: row.order.fundingStatus,
      fulfillmentStatus: row.order.fulfillmentStatus,
      deliveryStatus: row.order.deliveryStatus,
      createdAt: row.order.createdAt.toISOString(),
      overdue: row.order.fulfillmentStatus === 'manual_pending' && isManualFulfillmentOverdue(row.order.createdAt),
    }));
    const facets = {
      tenants: [
        { id: 'owner', name: 'My Store (Owner)' },
        ...[...tenantNames.entries()].map(([id, name]) => ({ id, name })),
      ],
      suppliers: ['Own Products', ...new Set([...supplierNames.values()])],
    };
    return jsonSuccess(
      {
        rows,
        facets,
        page,
        limit,
        total: filtered.length,
        meta: pageMeta(page, limit, filtered.length),
      },
      200,
      { cache: 'short' },
    );
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
