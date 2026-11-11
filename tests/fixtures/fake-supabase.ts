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
  | { readonly kind: 'in'; readonly column: string; readonly values: ReadonlyArray<string> }
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

    if (fn === 'adjust_customer_credit') {
      const customerId = String(args.p_customer_id);
      const delta = asMinor(args.p_delta);
      const customers = tableOf('customers');
      const customer = customers.find((row) => String(row.id) === customerId);
      if (!customer) {
        return {
          data: [{ success: false, new_balance: '0', error_code: 'INSUFFICIENT_CREDIT_OR_NOT_FOUND' }],
          error: null,
        };
      }
      const current = asMinor(customer.credit_balance ?? 0);
      const next = current + delta;
      if (next < 0n) {
        return {
          data: [{ success: false, new_balance: current.toString(), error_code: 'INSUFFICIENT_CREDIT_OR_NOT_FOUND' }],
          error: null,
        };
      }
      customer.credit_balance = next.toString();
      customer.updated_at = nowIso();
      return { data: [{ success: true, new_balance: next.toString(), error_code: null }], error: null };
    }

    if (fn === 'redeem_points_to_wallet') {
      const customerId = String(args.p_customer_id);
      const points = Number(args.p_points);
      const value = asMinor(args.p_value_per_point);
      const requestId = String(args.p_request_id ?? '');
      const minimum = Number(args.p_min_points);
      const customer = tableOf('customers').find((row) => String(row.id) === customerId);
      if (!customer) {
        return { data: [{ success: false, new_points: 0, new_balance: '0', error_code: 'CUSTOMER_NOT_FOUND' }], error: null };
      }
      const ledger = tableOf('points_ledger');
      const balanceOf = (): number =>
        ledger
          .filter((row) => String(row.customer_id) === customerId)
          .reduce((sum, row) => sum + Number(row.delta), 0);
      const existing = ledger.find(
        (row) =>
          String(row.customer_id) === customerId &&
          String(row.reason) === 'redeem_to_wallet' &&
          String(row.reference) === requestId,
      );
      const credit = asMinor(customer.credit_balance ?? 0);
      if (existing) {
        return {
          data: [{ success: true, new_points: balanceOf(), new_balance: credit.toString(), error_code: null }],
          error: null,
        };
      }
      const held = balanceOf();
      if (!requestId || !Number.isInteger(points) || points <= 0 || points < minimum) {
        return { data: [{ success: false, new_points: held, new_balance: credit.toString(), error_code: 'BELOW_MINIMUM' }], error: null };
      }
      if (held < points || value <= 0n) {
        return {
          data: [
            {
              success: false,
              new_points: held,
              new_balance: credit.toString(),
              error_code: held < points ? 'INSUFFICIENT_POINTS' : 'INVALID_VALUE',
            },
          ],
          error: null,
        };
      }
      ledger.push({
        id: crypto.randomUUID(),
        customer_id: customerId,
        tenant_id: null,
        delta: -points,
        reason: 'redeem_to_wallet',
        reference: requestId,
        created_at: nowIso(),
      });
      const next = credit + BigInt(points) * value;
      customer.credit_balance = next.toString();
      return { data: [{ success: true, new_points: balanceOf(), new_balance: next.toString(), error_code: null }], error: null };
    }

    if (fn === 'grant_referral_reward') {
      const referralId = String(args.p_referral_id);
      const points = Number(args.p_points);
      const cap = Number(args.p_daily_cap);
      const dayStart = String(args.p_day_start);
      const orderId = String(args.p_order_id);
      const referrals = tableOf('referrals');
      const referral = referrals.find((row) => String(row.id) === referralId);
      if (!referral) {
        return { data: [{ granted: false, capped: false, already: false }], error: null };
      }
      if (String(referral.status) === 'qualified') {
        return { data: [{ granted: false, capped: false, already: true }], error: null };
      }
      if (String(referral.status) !== 'pending') {
        return { data: [{ granted: false, capped: false, already: false }], error: null };
      }
      const dayEnd = new Date(new Date(dayStart).getTime() + 86_400_000).toISOString();
      const today = referrals.filter((row) => {
        if (String(row.referrer_customer_id) !== String(referral.referrer_customer_id)) {
          return false;
        }
        if (String(row.status) !== 'qualified') {
          return false;
        }
        const at = String(row.qualified_at ?? '');
        return at >= dayStart && at < dayEnd;
      }).length;
      if (Number.isInteger(cap) && cap >= 0 && today >= cap) {
        return { data: [{ granted: false, capped: true, already: false }], error: null };
      }
      referral.status = 'qualified';
      referral.qualified_order_id = orderId;
      referral.qualified_at = nowIso();
      if (Number.isInteger(points) && points > 0) {
        const ledger = tableOf('points_ledger');
        const duplicate = ledger.some(
          (row) =>
            String(row.customer_id) === String(referral.referrer_customer_id) &&
            String(row.reason) === 'referral_reward' &&
            String(row.reference) === referralId,
        );
        if (!duplicate) {
          ledger.push({
            id: crypto.randomUUID(),
            customer_id: referral.referrer_customer_id,
            tenant_id: referral.tenant_id ?? null,
            delta: points,
            reason: 'referral_reward',
            reference: referralId,
            created_at: nowIso(),
          });
        }
      }
      return { data: [{ granted: true, capped: false, already: false }], error: null };
    }

    if (fn === 'record_chain_payment') {
      const hash = String(args.p_tx_hash ?? '').trim().toLowerCase();
      const network = String(args.p_network ?? '').trim().toLowerCase();
      const purpose = String(args.p_purpose ?? '');
      const reference = String(args.p_reference_id ?? '');
      const amount = asMinor(args.p_amount_minor);
      const fail = (code: string) => ({ data: [{ success: false, error_code: code }], error: null });
      if (!/^0x[0-9a-f]{64}$/.test(hash)) {
        return fail('INVALID_HASH');
      }
      if (network !== 'bep20') {
        return fail('UNSUPPORTED_NETWORK');
      }
      if (purpose !== 'topup' && purpose !== 'order') {
        return fail('INVALID_PURPOSE');
      }
      if (reference.length === 0 || amount <= 0n) {
        return fail('INVALID_AMOUNT');
      }
      const payments = tableOf('chain_payments');
      const existing = payments.find((row) => String(row.network) === network && String(row.tx_hash) === hash);
      if (existing) {
        if (String(existing.purpose) === purpose && String(existing.reference_id) === reference) {
          return { data: [{ success: true, error_code: null }], error: null };
        }
        return fail('ALREADY_USED');
      }
      payments.push({
        id: crypto.randomUUID(),
        network,
        tx_hash: hash,
        purpose,
        reference_id: reference,
        customer_id: args.p_customer_id ?? null,
        amount_minor: amount.toString(),
        created_at: nowIso(),
      });
      return { data: [{ success: true, error_code: null }], error: null };
    }

    if (fn === 'credit_wallet_topup') {
      const topupId = String(args.p_topup_id ?? '');
      const hash = String(args.p_tx_hash ?? '').trim().toLowerCase();
      const amount = asMinor(args.p_amount_minor);
      const network = String(args.p_network ?? 'bep20').trim().toLowerCase() || 'bep20';
      const topup = tableOf('wallet_topups').find((row) => String(row.id) === topupId);
      const fail = (code: string, balance = 0n) => ({
        data: [{ success: false, new_balance: balance.toString(), error_code: code }],
        error: null,
      });
      if (!topup) {
        return fail('NOT_FOUND');
      }
      const customer = tableOf('customers').find((row) => String(row.id) === String(topup.customer_id));
      const balance = asMinor(customer?.credit_balance ?? 0);
      const validHash =
        /^0x[0-9a-f]{64}$/.test(hash) ||
        /^manual:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(hash);
      if (String(topup.status) === 'credited' && String(topup.tx_hash ?? '') === hash) {
        return { data: [{ success: true, new_balance: balance.toString(), error_code: null }], error: null };
      }
      if (String(topup.status) === 'credited') {
        return fail('ALREADY_CREDITED', balance);
      }
      if (String(topup.status) !== 'pending') {
        return fail('NOT_PENDING', balance);
      }
      if (String(topup.expires_at ?? '') <= nowIso()) {
        topup.status = 'expired';
        topup.reject_reason = 'EXPIRED';
        return fail('EXPIRED', balance);
      }
      if (network !== 'bep20' || !validHash) {
        return fail(network !== 'bep20' ? 'UNSUPPORTED_NETWORK' : 'INVALID_HASH', balance);
      }
      const expected = asMinor(topup.amount_expected_minor);
      const exact = args.p_exact !== false;
      if (amount <= 0n) {
        return fail('INVALID_AMOUNT', balance);
      }
      if (exact && amount !== expected) {
        return fail('AMOUNT_MISMATCH', balance);
      }
      const credit = exact ? expected : amount;
      if (!customer) {
        return fail('CUSTOMER_NOT_FOUND');
      }
      const payments = tableOf('chain_payments');
      if (payments.some((row) => String(row.network) === network && String(row.tx_hash) === hash)) {
        return fail('ALREADY_USED', balance);
      }
      payments.push({
        id: crypto.randomUUID(),
        network,
        tx_hash: hash,
        purpose: 'topup',
        reference_id: topup.id,
        customer_id: topup.customer_id,
        amount_minor: credit.toString(),
        created_at: nowIso(),
      });
      const next = balance + credit;
      customer.credit_balance = next.toString();
      topup.status = 'credited';
      topup.credited_amount_minor = credit.toString();
      topup.tx_hash = hash;
      topup.network = network;
      topup.credited_at = nowIso();
      topup.reject_reason = null;
      return { data: [{ success: true, new_balance: next.toString(), error_code: null }], error: null };
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
    let insertError: { message: string; code: string } | null = null;

    function pendingClash(row: MemoryRow): { message: string; code: string } | null {
      if (relation !== 'wallet_topups' || String(row.status ?? 'pending') !== 'pending') {
        return null;
      }
      const sameCustomer = table.some(
        (existing) => String(existing.status) === 'pending' && String(existing.customer_id) === String(row.customer_id),
      );
      if (sameCustomer) {
        return { code: '23505', message: 'duplicate key value violates unique constraint "wallet_topups_one_pending"' };
      }
      const sameAmount = table.some(
        (existing) =>
          String(existing.status) === 'pending' &&
          String(existing.pay_to_address ?? '') === String(row.pay_to_address ?? '') &&
          String(existing.amount_expected_minor) === String(row.amount_expected_minor),
      );
      if (sameAmount) {
        return { code: '23505', message: 'duplicate key value violates unique constraint "wallet_topups_pending_amount"' };
      }
      return null;
    }

    function matches(row: MemoryRow): boolean {
      return filters.every((filter) => {
        const actual = String(row[filter.column] ?? '');
        if (filter.kind === 'is') {
          return row[filter.column] === null || row[filter.column] === undefined;
        }
        if (filter.kind === 'in') {
          return filter.values.includes(actual);
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
        const clash = pendingClash(row);
        pendingInsert = null;
        if (clash) {
          insertError = clash;
          return [];
        }
        table.push(row);
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
      in(column, values): QueryBuilder<unknown> {
        filters.push({ kind: 'in', column, values });
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
        if (insertError) {
          const error = insertError;
          insertError = null;
          return { data: null as unknown, error };
        }
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
