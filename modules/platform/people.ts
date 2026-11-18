/**
 * @file modules/platform/people.ts
 *
 * Buyers and resellers for the People directory.
 */

import { AppError } from '@/lib/errors';
import { idsMatching, limitToIds } from '@/lib/row-ids';
import { formatUsdt } from '@/lib/money';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getWallet } from '@/modules/wallet';

export type PersonRow = {
  readonly id: string;
  readonly kind: 'buyer' | 'reseller';
  readonly name: string;
  readonly balance: string;
  readonly orders: number;
  readonly lastSeen: string;
  readonly state: string;
};

export type PeoplePayload = {
  readonly rows: readonly PersonRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
};

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) {
    throw new AppError('READ_FAILED', result.error.message, 500);
  }
  if (!Array.isArray(result.data)) {
    return [];
  }
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function minor(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' || typeof value === 'number') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function pageSize(value: number): number {
  return value === 48 || value === 96 ? value : 24;
}

function safeTerm(value: string): string {
  return value.replace(/[%_,."']/g, '').trim().slice(0, 80);
}

export async function readPeople(
  db: DbClient,
  input: { readonly role: 'owner' | 'reseller'; readonly tenantId: string | null; readonly botId: string | null; readonly kind: string; readonly q: string; readonly page: number; readonly pageSize: number },
): Promise<PeoplePayload> {
  const size = pageSize(input.pageSize);
  const page = Math.max(1, input.page);
  const from = (page - 1) * size;
  const term = safeTerm(input.q);
  if (input.kind === 'reseller') {
    if (input.role !== 'owner') {
      return { rows: [], total: 0, page, pageSize: size };
    }
    let query = db.from('tenants').select('id, display_name, status, updated_at', { count: 'exact' }).order('updated_at', { ascending: false });
    if (term) {
      query = limitToIds(query, await idsMatching(db, 'tenants', ['display_name'], term));
    }
    const result = (await query.range(from, from + size - 1)) as QueryResult<unknown>;
    const rows = records(result).map((row) => ({
      id: text(row.id),
      kind: 'reseller' as const,
      name: text(row.display_name) || 'Reseller',
      balance: '—',
      orders: 0,
      lastSeen: text(row.updated_at),
      state: text(row.status) || 'unknown',
    }));
    return { rows, total: result.count ?? rows.length, page, pageSize: size };
  }
  let query = db.from('customers').select('id, username, first_name, credit_balance, is_blocked, updated_at', { count: 'exact' }).order('updated_at', { ascending: false });
  if (input.role === 'reseller') {
    if (!input.botId) {
      return { rows: [], total: 0, page, pageSize: size };
    }
    query = query.eq('bot_id', input.botId);
  }
  if (term) {
    query = limitToIds(query, await idsMatching(db, 'customers', ['username', 'first_name'], term));
  }
  const result = (await query.range(from, from + size - 1)) as QueryResult<unknown>;
  const raw = records(result);
  const ids = raw.map((row) => text(row.id)).filter(Boolean);
  const orderRows = ids.length
    ? records((await db.from('orders').select('customer_id').in('customer_id', ids).limit(1000)) as QueryResult<unknown>)
    : [];
  const counts = new Map<string, number>();
  for (const order of orderRows) {
    const id = text(order.customer_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const rows = raw.map((row) => {
    const id = text(row.id);
    const name = text(row.username) ? `@${text(row.username)}` : text(row.first_name) || 'Buyer';
    return {
      id,
      kind: 'buyer' as const,
      name,
      balance: formatUsdt(minor(row.credit_balance)),
      orders: counts.get(id) ?? 0,
      lastSeen: text(row.updated_at),
      state: row.is_blocked === true ? 'blocked' : 'active',
    };
  });
  return { rows, total: result.count ?? rows.length, page, pageSize: size };
}

export async function readPerson(
  db: DbClient,
  input: { readonly id: string; readonly kind: string; readonly role: 'owner' | 'reseller'; readonly botId: string | null },
): Promise<{ readonly name: string; readonly state: string; readonly balance: string; readonly orders: readonly { readonly id: string; readonly total: string; readonly at: string }[]; readonly referrals: readonly string[]; readonly threads: readonly string[] } | null> {
  if (input.kind === 'reseller') {
    if (input.role !== 'owner') {
      return null;
    }
    const tenant = (await db.from('tenants').select('id, display_name, status').eq('id', input.id).maybeSingle()) as QueryResult<unknown>;
    const row = tenant.data && typeof tenant.data === 'object' ? (tenant.data as Record<string, unknown>) : null;
    if (!row) {
      return null;
    }
    let balance = formatUsdt(0n);
    try {
      const wallet = await getWallet(db, input.id);
      balance = formatUsdt(wallet.balanceAvailable);
    } catch {
      balance = 'No wallet yet';
    }
    return { name: text(row.display_name) || 'Reseller', state: text(row.status), balance, orders: [], referrals: [], threads: [] };
  }
  let customerQuery = db.from('customers').select('id, username, first_name, credit_balance, is_blocked, bot_id').eq('id', input.id);
  const customer = (await customerQuery.maybeSingle()) as QueryResult<unknown>;
  const row = customer.data && typeof customer.data === 'object' ? (customer.data as Record<string, unknown>) : null;
  if (!row) {
    return null;
  }
  if (input.role === 'reseller' && text(row.bot_id) !== (input.botId ?? '')) {
    return null;
  }
  const orders = records((await db.from('orders').select('id, quoted_retail_price, created_at').eq('customer_id', input.id).order('created_at', { ascending: false }).limit(8)) as QueryResult<unknown>);
  const referrals = records((await db.from('customers').select('username, first_name').eq('referred_by_customer_id', input.id).limit(8)) as QueryResult<unknown>);
  const threads = records((await db.from('support_threads').select('id').eq('customer_id', input.id).limit(8)) as QueryResult<unknown>);
  return {
    name: text(row.username) ? `@${text(row.username)}` : text(row.first_name) || 'Buyer',
    state: row.is_blocked === true ? 'blocked' : 'active',
    balance: formatUsdt(minor(row.credit_balance)),
    orders: orders.map((order) => ({ id: text(order.id), total: formatUsdt(minor(order.quoted_retail_price)), at: text(order.created_at) })),
    referrals: referrals.map((person) => (text(person.username) ? `@${text(person.username)}` : text(person.first_name) || 'Buyer')),
    threads: threads.map((thread) => text(thread.id)).filter(Boolean),
  };
}
