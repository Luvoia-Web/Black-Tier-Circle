/**
 * Counts for the sidebar badges, the live chip, and the goal ring.
 * Read-only. A missing support table reports zero instead of failing the shell.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import type { QueryResult } from '@/lib/supabase/query';
import { getBotConnection } from '@/modules/bots';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

function countOf(result: QueryResult<unknown>): number {
  return typeof result.count === 'number' ? result.count : 0;
}

function missing(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return error.code === '42P01' || error.code === '42703' || message.includes('does not exist') || message.includes('schema cache');
}

export async function GET(): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to this workspace', 403);
    }
    const db = asDbClient(session.admin);
    const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
    const bot = tenant ? await getBotConnection(db, tenant.id) : null;
    const liveSince = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    let orders = db.from('orders').select('id', { count: 'exact', head: true }).or('fulfillment_status.eq.failed,payment_status.eq.failed');
    let live = db.from('customers').select('id', { count: 'exact', head: true }).gte('updated_at', liveSince);
    let day = db.from('orders').select('quoted_retail_price, payment_status').eq('payment_status', 'verified').gte('created_at', dayStart.toISOString()).limit(500);
    if (tenant) {
      orders = orders.eq('tenant_id', tenant.id);
      day = day.eq('tenant_id', tenant.id);
    }
    if (bot) {
      live = live.eq('bot_id', bot.id);
    }

    const [orderResult, liveResult, dayResult] = await Promise.all([
      orders as unknown as Promise<QueryResult<unknown>>,
      live as unknown as Promise<QueryResult<unknown>>,
      day as unknown as Promise<QueryResult<unknown>>,
    ]);

    let support = 0;
    let supportQuery = db.from('support_threads').select('id', { count: 'exact', head: true }).eq('unread_for_owner', true);
    if (tenant) supportQuery = supportQuery.eq('tenant_id', tenant.id);
    const supportResult = (await supportQuery) as QueryResult<unknown>;
    if (!supportResult.error) support = countOf(supportResult);
    else if (!missing(supportResult.error)) support = 0;

    let resellers = 0;
    if (role === 'owner') {
      const pending = (await db.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'pending')) as QueryResult<unknown>;
      if (!pending.error) resellers = countOf(pending);
    }

    const rows = Array.isArray(dayResult.data) ? dayResult.data : [];
    const revenueMinor = rows.reduce((sum, row) => {
      if (typeof row !== 'object' || row === null) return sum;
      const value = (row as { quoted_retail_price?: unknown }).quoted_retail_price;
      try {
        return sum + BigInt(typeof value === 'string' || typeof value === 'number' ? value : 0);
      } catch {
        return sum;
      }
    }, 0n);

    return jsonSuccess({
      orders: orderResult.error ? 0 : countOf(orderResult),
      support,
      resellers,
      live: liveResult.error ? 0 : countOf(liveResult),
      revenueMinor: revenueMinor.toString(),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
