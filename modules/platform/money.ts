/**
 * @file modules/platform/money.ts
 *
 * The numbers on the Money page. Top-up review stays on the existing route.
 */

import { AppError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { listSuppliers } from '@/modules/supplier';
import { getWallet, listResellerWallets } from '@/modules/wallet';

export type MoneyPayload = {
  readonly role: 'owner' | 'reseller';
  readonly ownerBalance: string;
  readonly customerWallets: string;
  readonly resellerDebt: string;
  readonly pendingOrders: string;
  readonly suppliers: readonly { readonly id: string; readonly name: string; readonly balance: string; readonly warning: boolean }[];
  readonly wallets: readonly { readonly id: string; readonly name: string; readonly available: string; readonly reserved: string }[];
  readonly ledger: readonly { readonly id: string; readonly kind: string; readonly amount: string; readonly at: string }[];
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

export async function readMoney(db: DbClient, scope: { readonly role: 'owner' | 'reseller'; readonly tenantId: string | null }, kind: string): Promise<MoneyPayload> {
  const pendingQuery = scope.tenantId
    ? db.from('orders').select('quoted_wholesale_price, fulfillment_status').eq('fulfillment_status', 'supplier_pending').eq('tenant_id', scope.tenantId).limit(500)
    : db.from('orders').select('quoted_wholesale_price, fulfillment_status').eq('fulfillment_status', 'supplier_pending').limit(500);
  const pending = records((await pendingQuery) as QueryResult<unknown>);
  const pendingMinor = pending.reduce((sum, row) => sum + minor(row.quoted_wholesale_price), 0n);
  const suppliers = scope.role === 'owner' ? await listSuppliers(db) : [];
  const supplierRows = suppliers.map((supplier) => {
    const balanceMinor = BigInt(Math.round(Number(supplier.balanceUsdt || '0') * 1_000_000));
    return {
      id: supplier.id,
      name: supplier.name,
      balance: formatUsdt(balanceMinor),
      warning: balanceMinor < pendingMinor,
    };
  });

  let wallets: MoneyPayload['wallets'] = [];
  let ownerBalance = formatUsdt(0n);
  let resellerDebt = formatUsdt(0n);
  if (scope.role === 'owner') {
    const listed = await listResellerWallets(db);
    wallets = listed.map((wallet) => ({
      id: wallet.walletId,
      name: wallet.tenantName,
      available: formatUsdt(wallet.balanceAvailable),
      reserved: formatUsdt(wallet.balanceReserved),
    }));
    const owed = records((await db.from('orders').select('tenant_id, quoted_wholesale_price, funding_status, payment_status').limit(500)) as QueryResult<unknown>);
    resellerDebt = formatUsdt(owed.filter((row) => text(row.tenant_id) && (text(row.funding_status) === 'reserved' || (text(row.payment_status) === 'verified' && text(row.funding_status) === 'not_applicable'))).reduce((sum, row) => sum + minor(row.quoted_wholesale_price), 0n));
    const paid = records((await db.from('orders').select('quoted_retail_price').eq('payment_status', 'verified').is('tenant_id', null).limit(500)) as QueryResult<unknown>);
    ownerBalance = formatUsdt(paid.reduce((sum, row) => sum + minor(row.quoted_retail_price), 0n));
  } else if (scope.tenantId) {
    try {
      const wallet = await getWallet(db, scope.tenantId);
      wallets = [{ id: wallet.id, name: 'Your wallet', available: formatUsdt(wallet.balanceAvailable), reserved: formatUsdt(wallet.balanceReserved) }];
      ownerBalance = formatUsdt(wallet.balanceAvailable);
    } catch {
      wallets = [];
      ownerBalance = formatUsdt(0n);
    }
    const owed = records((await db.from('orders').select('quoted_wholesale_price, funding_status, payment_status').eq('tenant_id', scope.tenantId).limit(500)) as QueryResult<unknown>);
    resellerDebt = formatUsdt(owed.filter((row) => text(row.funding_status) === 'reserved' || (text(row.payment_status) === 'verified' && text(row.funding_status) === 'not_applicable')).reduce((sum, row) => sum + minor(row.quoted_wholesale_price), 0n));
  }

  let credits: Record<string, unknown>[] = [];
  if (scope.role === 'owner') {
    credits = records((await db.from('customers').select('credit_balance').limit(1000)) as QueryResult<unknown>);
  } else if (scope.tenantId) {
    const bots = records((await db.from('bot_connections').select('id').eq('tenant_id', scope.tenantId).limit(1)) as QueryResult<unknown>);
    const botId = text(bots[0]?.id);
    if (botId) {
      credits = records((await db.from('customers').select('credit_balance').eq('bot_id', botId).limit(1000)) as QueryResult<unknown>);
    }
  }
  const customerWallets = formatUsdt(credits.reduce((sum, row) => sum + minor(row.credit_balance), 0n));

  let ledgerQuery = db.from('ledger_transactions').select('id, entry_type, amount, created_at').order('created_at', { ascending: false }).limit(50);
  if (kind) {
    ledgerQuery = ledgerQuery.eq('entry_type', kind);
  }
  if (scope.role === 'reseller' && wallets[0]) {
    ledgerQuery = ledgerQuery.eq('wallet_id', wallets[0].id);
  }
  const ledgerResult = (await ledgerQuery) as QueryResult<unknown>;
  const ledgerRows = ledgerResult.error ? [] : records(ledgerResult);
  const ledger = ledgerRows.map((row) => ({
    id: text(row.id),
    kind: text(row.entry_type),
    amount: formatUsdt(minor(row.amount)),
    at: text(row.created_at),
  }));

  return {
    role: scope.role,
    ownerBalance,
    customerWallets,
    resellerDebt,
    pendingOrders: formatUsdt(pendingMinor),
    suppliers: supplierRows,
    wallets,
    ledger,
  };
}

export function moneyCsv(payload: MoneyPayload): string {
  const header = 'id,kind,amount,at';
  const body = payload.ledger.map((row) => [row.id, row.kind, row.amount, row.at].map((value) => `"${value.replaceAll('"', '""')}"`).join(','));
  return [header, ...body].join('\n');
}
