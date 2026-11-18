/**
 * @file app/api/platform/search/route.ts
 *
 * Command palette search. Owner sees the whole platform. A reseller sees
 * only their listings, orders, and buyers.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { ROUTES } from '@/lib/navigation';
import { idsMatching, limitToIds } from '@/lib/row-ids';
import type { QueryResult } from '@/lib/supabase/query';
import { getBotConnection } from '@/modules/bots';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Hit = {
  readonly kind: 'product' | 'order' | 'customer' | 'reseller';
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly href: string;
};

function termOf(raw: string | null): string {
  return (raw ?? '').replace(/[%_,."']/g, '').trim().slice(0, 64);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rows(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error || !Array.isArray(result.data)) {
    return [];
  }
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to this search', 403);
    }
    const term = termOf(new URL(request.url).searchParams.get('q'));
    if (term.length < 2) {
      return jsonSuccess({ results: [] });
    }
    const db = asDbClient(session.admin);
    const tenantId = role === 'reseller' ? (await getTenantByUserId(db, session.user.id)).id : null;
    const needle = term.toLowerCase();
    const uuid = UUID.test(term);
    const results: Hit[] = [];

    let productQuery = db.from('products').select('id, title, sku').limit(8);
    if (tenantId) {
      const listings = rows(
        (await db.from('reseller_listings').select('product_id').eq('tenant_id', tenantId).limit(400)) as QueryResult<unknown>,
      );
      const ids = listings.map((row) => text(row.product_id)).filter((id) => id.length > 0);
      productQuery = ids.length > 0 ? productQuery.in('id', ids) : productQuery.in('id', ['00000000-0000-4000-8000-000000000000']);
    }
    productQuery = uuid ? productQuery.eq('id', term) : limitToIds(productQuery, await idsMatching(db, 'products', ['title', 'sku'], term, 8));
    for (const row of rows((await productQuery) as QueryResult<unknown>)) {
      const id = text(row.id);
      if (!id) {
        continue;
      }
      results.push({
        kind: 'product',
        id,
        label: text(row.title) || id,
        hint: text(row.sku) || id,
        href: `${ROUTES.platform.catalog}?item=${encodeURIComponent(id)}`,
      });
    }

    let orderQuery = db.from('orders').select('id, external_order_ref').order('created_at', { ascending: false }).limit(80);
    if (tenantId) {
      orderQuery = orderQuery.eq('tenant_id', tenantId);
    }
    for (const row of rows((await orderQuery) as QueryResult<unknown>)) {
      const id = text(row.id);
      const ref = text(row.external_order_ref).toLowerCase();
      const compact = id.replaceAll('-', '').toLowerCase();
      const wanted = needle.replaceAll('-', '');
      if (!id || (!compact.includes(wanted) && !ref.includes(needle))) {
        continue;
      }
      results.push({
        kind: 'order',
        id,
        label: `Order ${id.slice(0, 8)}`,
        hint: text(row.external_order_ref) || id,
        href: `${ROUTES.platform.orders}?order=${encodeURIComponent(id)}`,
      });
      if (results.filter((hit) => hit.kind === 'order').length >= 8) {
        break;
      }
    }

    let customerQuery = db.from('customers').select('id, username, first_name, telegram_user_id').limit(8);
    if (tenantId) {
      const bot = await getBotConnection(db, tenantId);
      customerQuery = bot ? customerQuery.eq('bot_id', bot.id) : customerQuery.in('id', ['00000000-0000-4000-8000-000000000000']);
    }
    customerQuery = uuid
      ? customerQuery.eq('id', term)
      : limitToIds(customerQuery, await idsMatching(db, 'customers', ['username', 'first_name', 'telegram_user_id'], term, 8));
    for (const row of rows((await customerQuery) as QueryResult<unknown>)) {
      const id = text(row.id);
      if (!id) {
        continue;
      }
      const username = text(row.username);
      results.push({
        kind: 'customer',
        id,
        label: username ? `@${username}` : text(row.first_name) || text(row.telegram_user_id) || id,
        hint: id,
        href: `${ROUTES.platform.people}?person=${encodeURIComponent(id)}`,
      });
    }

    if (role === 'owner') {
      let resellerQuery = db.from('tenants').select('id, display_name, business_name, status').limit(8);
      resellerQuery = uuid
        ? resellerQuery.eq('id', term)
        : limitToIds(resellerQuery, await idsMatching(db, 'tenants', ['display_name', 'business_name'], term, 8));
      for (const row of rows((await resellerQuery) as QueryResult<unknown>)) {
        const id = text(row.id);
        if (!id) {
          continue;
        }
        results.push({
          kind: 'reseller',
          id,
          label: text(row.business_name) || text(row.display_name) || id,
          hint: text(row.status) || 'Reseller',
          href: `${ROUTES.platform.people}?type=reseller&person=${encodeURIComponent(id)}`,
        });
      }
    }

    return jsonSuccess({ results });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
