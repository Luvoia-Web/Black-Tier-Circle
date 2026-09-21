/**
 * @file app/api/reseller/deposits/route.ts
 *
 * GET token history, payment deposit status, and tenant audit log.
 *
 * Phase 9 auth audit: getUser() via requireReseller.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { formatUsdt } from '@/lib/money';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getCustomerById } from '@/modules/bots';
import { listOrders } from '@/modules/orders';
import { mapPaymentClaimRow } from '@/modules/payments/map';
import type { PaymentClaimRow } from '@/modules/payments/types';
import { getWallet, listTopupTokens } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const params = new URL(request.url).searchParams;
    const search = (params.get('q') ?? '').trim().toLowerCase();
    const statusFilter = params.get('status') ?? 'all';
    const sourceFilter = params.get('source') ?? 'all';
    const db = asDbClient(session.admin);
    const [wallet, tokens, orders] = await Promise.all([
      getWallet(db, session.tenant.id),
      listTopupTokens(db, { tenantId: session.tenant.id }),
      listOrders(db, { tenantId: session.tenant.id, limit: 500 }),
    ]);

    const depositRows = [];
    let approved = 0;
    let pending = 0;
    let failed = 0;
    let creditedMinor = 0n;
    for (const order of orders) {
      const claims = await listClaims(db, order.id);
      const claim = claims[0];
      let depositStatus: 'approved' | 'pending' | 'failed' = 'pending';
      if (order.paymentStatus === 'verified') {
        depositStatus = 'approved';
        approved += 1;
        creditedMinor += order.quotedRetailPriceMinor;
      } else if (
        order.paymentStatus === 'failed' ||
        order.paymentStatus === 'expired' ||
        order.paymentStatus === 'disputed'
      ) {
        depositStatus = 'failed';
        failed += 1;
      } else {
        pending += 1;
      }
      const source = order.paymentMethod ?? 'unknown';
      const txid = claim?.txHash ?? claim?.binanceOrderId ?? order.id.slice(0, 8);
      if (statusFilter !== 'all' && depositStatus !== statusFilter) {
        continue;
      }
      if (sourceFilter !== 'all' && source !== sourceFilter) {
        continue;
      }
      if (
        search &&
        !txid.toLowerCase().includes(search) &&
        !order.id.toLowerCase().includes(search)
      ) {
        continue;
      }
      let userLabel = '—';
      if (order.customerId) {
        try {
          const customer = await getCustomerById(db, order.customerId);
          userLabel = customer.username ? `@${customer.username}` : customer.telegramUserId;
        } catch {
          userLabel = '—';
        }
      }
      depositRows.push({
        status: depositStatus,
        source,
        txid,
        endpoint: order.channel,
        result: claim?.rejectReason ?? order.paymentStatus,
        credited: depositStatus === 'approved' ? formatUsdt(order.quotedRetailPriceMinor) : '—',
        user: userLabel,
        when: order.createdAt.toISOString(),
      });
    }

    const audit = await listAudit(db, session.tenant.id);

    return jsonSuccess({
      wallet: {
        availableMinor: wallet.balanceAvailable.toString(),
        totalMinor: wallet.balanceTotal.toString(),
      },
      tokens: tokens.map((token) => ({
        id: token.id,
        prefix: token.token.slice(0, 4),
        amount: formatUsdt(token.amountUsdt),
        status: token.status === 'redeemed' ? 'used' : token.status === 'active' ? 'active' : token.status,
        date: (token.redeemedAt ?? token.createdAt).toISOString(),
      })),
      deposits: {
        totalCredited: formatUsdt(creditedMinor),
        approved,
        pending,
        failed,
        rows: depositRows,
      },
      audit,
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

async function listClaims(supabase: DbClient, orderId: string) {
  const result = (await supabase
    .from('payment_claims')
    .select('*')
    .eq('order_id', orderId)
    .order('submitted_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error || !Array.isArray(result.data)) {
    return [];
  }
  return result.data.map((row) => mapPaymentClaimRow(row as PaymentClaimRow));
}

async function listAudit(supabase: DbClient, tenantId: string) {
  const result = (await supabase
    .from('audit_log')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)) as QueryResult<unknown[] | null>;
  if (result.error || !Array.isArray(result.data)) {
    return [];
  }
  return result.data.map((row) => {
    const item = row as {
      id: string;
      action: string;
      actor_id: string | null;
      reason: string | null;
      after_val: Record<string, unknown> | null;
      created_at: string;
    };
    return {
      id: item.id,
      eventType: item.action,
      user: item.actor_id ? item.actor_id.slice(0, 8) : 'system',
      amount: typeof item.after_val?.amountUsdt === 'string' ? item.after_val.amountUsdt : '—',
      method: typeof item.after_val?.method === 'string' ? item.after_val.method : '—',
      description: item.reason ?? item.action,
      timestamp: item.created_at,
    };
  });
}
