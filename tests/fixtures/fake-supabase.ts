/**
 * @file tests/fixtures/fake-supabase.ts
 *
 * In-memory Supabase query-builder mock for unit tests.
 *
 * @module Tests
 */

import type { DbClient, QueryBuilder, QueryResult, StorageAdapter } from '@/lib/supabase/query';

export type MemoryRow = Record<string, unknown>;

type Filter =
  | { readonly kind: 'eq' | 'gte' | 'lte'; readonly column: string; readonly value: string }
  | { readonly kind: 'is'; readonly column: string; readonly value: null };

function asMinor(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return BigInt(value);
  }
  return 0n;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Creates a DbClient backed by in-memory tables and private storage.
 *
 * @param initial - Optional seed rows keyed by table name
 */
export function createMemoryDb(initial: Record<string, MemoryRow[]> = {}): DbClient & {
  readonly tables: Record<string, MemoryRow[]>;
  readonly storedFiles: Map<string, string>;
} {
  const tables: Record<string, MemoryRow[]> = {
    profiles: [],
    tenants: [],
    invitations: [],
    products: [],
    product_assets: [],
    reseller_listings: [],
    wallets: [],
    ledger_transactions: [],
    topup_tokens: [],
    wallet_reservations: [],
    audit_log: [],
    ...Object.fromEntries(
      Object.entries(initial).map(([key, rows]) => [key, rows.map((row) => ({ ...row }))]),
    ),
  };

  const storedFiles = new Map<string, string>();

  const storage: StorageAdapter = {
    from(bucket: string) {
      return {
        async upload(path: string): Promise<QueryResult<{ path: string } | null>> {
          storedFiles.set(`${bucket}:${path}`, path);
          return { data: { path }, error: null };
        },
        async remove(paths: string[]): Promise<QueryResult<null>> {
          for (const path of paths) {
            storedFiles.delete(`${bucket}:${path}`);
          }
          return { data: null, error: null };
        },
        async createSignedUrl(path: string, expiresIn: number) {
          return {
            data: { signedUrl: `https://signed.example.test/${bucket}/${path}?exp=${expiresIn}` },
            error: null,
          };
        },
      };
    },
  };

  function tableOf(relation: string): MemoryRow[] {
    const existing = tables[relation];
    if (existing) {
      return existing;
    }
    const created: MemoryRow[] = [];
    tables[relation] = created;
    return created;
  }

  function appendLedger(row: MemoryRow): void {
    tableOf('ledger_transactions').push({
      id: crypto.randomUUID(),
      created_at: nowIso(),
      ...row,
    });
  }

  async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<QueryResult<unknown>> {
    if (fn === 'create_wallet') {
      const tenantId = String(args.p_tenant_id);
      const wallets = tableOf('wallets');
      const existing = wallets.find((row) => String(row.tenant_id) === tenantId);
      if (existing) {
        return { data: existing.id, error: null };
      }
      const row: MemoryRow = {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        balance_total: '0',
        balance_reserved: '0',
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      wallets.push(row);
      return { data: row.id, error: null };
    }

    if (fn === 'redeem_topup_token') {
      const token = String(args.p_token);
      const tenantId = String(args.p_tenant_id);
      const redeemedBy = String(args.p_redeemed_by);
      const tokens = tableOf('topup_tokens');
      const tokenRow = tokens.find((row) => String(row.token).trim() === token);
      if (!tokenRow) {
        return { data: [{ success: false, amount_credited: '0', new_balance: '0', error_code: 'TOKEN_NOT_FOUND' }], error: null };
      }
      if (String(tokenRow.status) !== 'active') {
        return {
          data: [
            {
              success: false,
              amount_credited: '0',
              new_balance: '0',
              error_code: `TOKEN_${String(tokenRow.status).toUpperCase()}`,
            },
          ],
          error: null,
        };
      }
      if (tokenRow.expires_at && String(tokenRow.expires_at) < nowIso()) {
        tokenRow.status = 'expired';
        return { data: [{ success: false, amount_credited: '0', new_balance: '0', error_code: 'TOKEN_EXPIRED' }], error: null };
      }
      if (tokenRow.tenant_id !== null && tokenRow.tenant_id !== undefined && String(tokenRow.tenant_id) !== tenantId) {
        return { data: [{ success: false, amount_credited: '0', new_balance: '0', error_code: 'TOKEN_WRONG_TENANT' }], error: null };
      }
      const wallet = tableOf('wallets').find((row) => String(row.tenant_id) === tenantId);
      if (!wallet) {
        return { data: [{ success: false, amount_credited: '0', new_balance: '0', error_code: 'WALLET_NOT_FOUND' }], error: null };
      }
      const amount = asMinor(tokenRow.amount_usdt);
      const newBalance = asMinor(wallet.balance_total) + amount;
      wallet.balance_total = newBalance.toString();
      wallet.updated_at = nowIso();
      appendLedger({
        wallet_id: wallet.id,
        entry_type: 'top_up_credit',
        amount: amount.toString(),
        balance_after: newBalance.toString(),
        reference_id: token,
        reference_type: 'topup_token',
        actor_id: redeemedBy,
        note: 'Top-up token redeemed',
      });
      tokenRow.status = 'redeemed';
      tokenRow.redeemed_by = redeemedBy;
      tokenRow.redeemed_at = nowIso();
      return {
        data: [{ success: true, amount_credited: amount.toString(), new_balance: newBalance.toString(), error_code: null }],
        error: null,
      };
    }

    if (fn === 'reserve_wallet_funds') {
      const walletId = String(args.p_wallet_id);
      const orderId = String(args.p_order_id);
      const amount = asMinor(args.p_amount);
      const expiresAt = String(args.p_expires_at);
      if (amount <= 0n) {
        return { data: [{ success: false, error_code: 'AMOUNT_MUST_BE_POSITIVE' }], error: null };
      }
      const reservations = tableOf('wallet_reservations');
      const existing = reservations.find((row) => String(row.order_id) === orderId);
      if (existing) {
        if (
          String(existing.status) === 'active' &&
          asMinor(existing.amount) === amount &&
          String(existing.wallet_id) === walletId
        ) {
          return { data: [{ success: true, error_code: null }], error: null };
        }
        return { data: [{ success: false, error_code: 'RESERVATION_EXISTS' }], error: null };
      }
      const wallet = tableOf('wallets').find((row) => String(row.id) === walletId);
      if (!wallet) {
        return { data: [{ success: false, error_code: 'WALLET_NOT_FOUND' }], error: null };
      }
      const available = asMinor(wallet.balance_total) - asMinor(wallet.balance_reserved);
      if (available < amount) {
        return { data: [{ success: false, error_code: 'INSUFFICIENT_FUNDS' }], error: null };
      }
      wallet.balance_reserved = (asMinor(wallet.balance_reserved) + amount).toString();
      wallet.updated_at = nowIso();
      appendLedger({
        wallet_id: walletId,
        entry_type: 'reservation',
        amount: '0',
        balance_after: asMinor(wallet.balance_total).toString(),
        reference_id: orderId,
        reference_type: 'order',
        note: `Funds reserved for order ${orderId}`,
      });
      reservations.push({
        id: crypto.randomUUID(),
        wallet_id: walletId,
        order_id: orderId,
        amount: amount.toString(),
        status: 'active',
        expires_at: expiresAt,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      return { data: [{ success: true, error_code: null }], error: null };
    }

    if (fn === 'consume_wallet_reservation') {
      const orderId = String(args.p_order_id);
      const reservations = tableOf('wallet_reservations');
      const existing = reservations.find(
        (row) => String(row.order_id) === orderId && String(row.status) === 'active',
      );
      if (!existing) {
        return { data: [{ success: false, error_code: 'RESERVATION_NOT_FOUND' }], error: null };
      }
      const wallet = tableOf('wallets').find((row) => String(row.id) === String(existing.wallet_id));
      if (!wallet) {
        return { data: [{ success: false, error_code: 'WALLET_NOT_FOUND' }], error: null };
      }
      const amount = asMinor(existing.amount);
      const newTotal = asMinor(wallet.balance_total) - amount;
      const newReserved = asMinor(wallet.balance_reserved) - amount;
      if (newTotal < 0n || newReserved < 0n) {
        return { data: [{ success: false, error_code: 'BALANCE_INTEGRITY_ERROR' }], error: null };
      }
      wallet.balance_total = newTotal.toString();
      wallet.balance_reserved = newReserved.toString();
      wallet.updated_at = nowIso();
      existing.status = 'consumed';
      existing.updated_at = nowIso();
      appendLedger({
        wallet_id: wallet.id,
        entry_type: 'wholesale_debit',
        amount: (-amount).toString(),
        balance_after: newTotal.toString(),
        reference_id: orderId,
        reference_type: 'order',
        note: `Wholesale debit for fulfilled order ${orderId}`,
      });
      return { data: [{ success: true, error_code: null }], error: null };
    }

    if (fn === 'release_wallet_reservation') {
      const orderId = String(args.p_order_id);
      const reservations = tableOf('wallet_reservations');
      const existing = reservations.find(
        (row) => String(row.order_id) === orderId && String(row.status) === 'active',
      );
      if (!existing) {
        return { data: [{ success: false, error_code: 'RESERVATION_NOT_FOUND' }], error: null };
      }
      const wallet = tableOf('wallets').find((row) => String(row.id) === String(existing.wallet_id));
      if (!wallet) {
        return { data: [{ success: false, error_code: 'WALLET_NOT_FOUND' }], error: null };
      }
      wallet.balance_reserved = (asMinor(wallet.balance_reserved) - asMinor(existing.amount)).toString();
      wallet.updated_at = nowIso();
      existing.status = 'released';
      existing.updated_at = nowIso();
      appendLedger({
        wallet_id: wallet.id,
        entry_type: 'reservation_release',
        amount: '0',
        balance_after: asMinor(wallet.balance_total).toString(),
        reference_id: orderId,
        reference_type: 'order',
        note: args.p_reason ?? 'Order cancelled',
      });
      return { data: [{ success: true, error_code: null }], error: null };
    }

    if (fn === 'manual_wallet_credit') {
      const walletId = String(args.p_wallet_id);
      const amount = asMinor(args.p_amount);
      if (amount <= 0n) {
        return { data: [{ success: false, new_balance: '0', error_code: 'AMOUNT_MUST_BE_POSITIVE' }], error: null };
      }
      const wallet = tableOf('wallets').find((row) => String(row.id) === walletId);
      if (!wallet) {
        return { data: [{ success: false, new_balance: '0', error_code: 'WALLET_NOT_FOUND' }], error: null };
      }
      const newBalance = asMinor(wallet.balance_total) + amount;
      wallet.balance_total = newBalance.toString();
      wallet.updated_at = nowIso();
      appendLedger({
        wallet_id: walletId,
        entry_type: 'manual_credit',
        amount: amount.toString(),
        balance_after: newBalance.toString(),
        reference_type: 'manual',
        actor_id: args.p_actor_id,
        note: args.p_note,
      });
      return { data: [{ success: true, new_balance: newBalance.toString(), error_code: null }], error: null };
    }

    if (fn === 'manual_wallet_debit') {
      const walletId = String(args.p_wallet_id);
      const amount = asMinor(args.p_amount);
      const wallet = tableOf('wallets').find((row) => String(row.id) === walletId);
      if (!wallet) {
        return { data: [{ success: false, new_balance: '0', error_code: 'WALLET_NOT_FOUND' }], error: null };
      }
      const available = asMinor(wallet.balance_total) - asMinor(wallet.balance_reserved);
      if (available < amount) {
        return { data: [{ success: false, new_balance: '0', error_code: 'INSUFFICIENT_AVAILABLE_FUNDS' }], error: null };
      }
      const newBalance = asMinor(wallet.balance_total) - amount;
      wallet.balance_total = newBalance.toString();
      wallet.updated_at = nowIso();
      appendLedger({
        wallet_id: walletId,
        entry_type: 'manual_debit',
        amount: (-amount).toString(),
        balance_after: newBalance.toString(),
        reference_type: 'manual',
        actor_id: args.p_actor_id,
        note: args.p_note,
      });
      return { data: [{ success: true, new_balance: newBalance.toString(), error_code: null }], error: null };
    }

    return { data: null, error: { message: `unknown rpc ${fn}` } };
  }

  function from(relation: string): QueryBuilder<unknown> {
    const table = tableOf(relation);
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    const filters: Filter[] = [];
    let pendingInsert: MemoryRow | null = null;
    let pendingUpdate: MemoryRow | null = null;
    let orderColumn: string | null = null;
    let ascending = true;
    let rangeFrom: number | null = null;
    let rangeTo: number | null = null;
    let limitCount: number | null = null;

    function matches(row: MemoryRow): boolean {
      return filters.every((filter) => {
        const actual = String(row[filter.column] ?? '');
        if (filter.kind === 'is') {
          return row[filter.column] === null || row[filter.column] === undefined;
        }
        if (filter.kind === 'gte') {
          return actual >= filter.value;
        }
        if (filter.kind === 'lte') {
          return actual <= filter.value;
        }
        return actual === filter.value;
      });
    }

    function apply(): MemoryRow[] {
      if (mode === 'insert' && pendingInsert !== null) {
        const row: MemoryRow = {
          created_at: nowIso(),
          updated_at: nowIso(),
          ...pendingInsert,
          id: pendingInsert.id ?? crypto.randomUUID(),
        };
        table.push(row);
        pendingInsert = null;
        return [row];
      }
      if (mode === 'update' && pendingUpdate !== null) {
        const updated: MemoryRow[] = [];
        for (let index = 0; index < table.length; index += 1) {
          const current = table[index];
          if (current && matches(current)) {
            const next = { ...current, ...pendingUpdate };
            table[index] = next;
            updated.push(next);
          }
        }
        return updated;
      }
      if (mode === 'delete') {
        const deleted: MemoryRow[] = [];
        for (let index = table.length - 1; index >= 0; index -= 1) {
          const current = table[index];
          if (current && matches(current)) {
            deleted.push(current);
            table.splice(index, 1);
          }
        }
        return deleted;
      }
      let rows = table.filter(matches);
      if (orderColumn) {
        const column = orderColumn;
        rows = [...rows].sort((left, right) => {
          const av = String(left[column] ?? '');
          const bv = String(right[column] ?? '');
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (rangeFrom !== null && rangeTo !== null) {
        rows = rows.slice(rangeFrom, rangeTo + 1);
      } else if (limitCount !== null) {
        rows = rows.slice(0, limitCount);
      }
      return rows;
    }

    const builder: QueryBuilder<unknown> = {
      select(): QueryBuilder<unknown> {
        return builder;
      },
      insert(values): QueryBuilder<unknown> {
        mode = 'insert';
        pendingInsert = Array.isArray(values) ? (values[0] ?? {}) : values;
        return builder;
      },
      update(values): QueryBuilder<unknown> {
        mode = 'update';
        pendingUpdate = values;
        return builder;
      },
      delete(): QueryBuilder<unknown> {
        mode = 'delete';
        return builder;
      },
      eq(column, value): QueryBuilder<unknown> {
        filters.push({ kind: 'eq', column, value });
        return builder;
      },
      is(column, value): QueryBuilder<unknown> {
        filters.push({ kind: 'is', column, value });
        return builder;
      },
      gte(column, value): QueryBuilder<unknown> {
        filters.push({ kind: 'gte', column, value });
        return builder;
      },
      lte(column, value): QueryBuilder<unknown> {
        filters.push({ kind: 'lte', column, value });
        return builder;
      },
      order(column, options): QueryBuilder<unknown> {
        orderColumn = column;
        ascending = options?.ascending !== false;
        return builder;
      },
      limit(count): QueryBuilder<unknown> {
        limitCount = count;
        return builder;
      },
      range(fromIndex, toIndex): QueryBuilder<unknown> {
        rangeFrom = fromIndex;
        rangeTo = toIndex;
        return builder;
      },
      async maybeSingle(): Promise<QueryResult<unknown | null>> {
        const rows = apply();
        return { data: rows[0] ?? null, error: null };
      },
      async single(): Promise<QueryResult<unknown>> {
        const rows = apply();
        const row = rows[0];
        if (!row) {
          return { data: null as unknown, error: { message: 'not found' } };
        }
        return { data: row, error: null };
      },
      then(onfulfilled, onrejected) {
        return Promise.resolve({ data: apply(), error: null }).then(onfulfilled, onrejected);
      },
    };
    return builder;
  }

  return { from, rpc, storage, tables, storedFiles };
}
