/**
 * @file modules/platform/money.ts
 *
 * Balances, wallets, filtered ledger, CSV export, and per-order wholesale debts
 * for the Wallets & ledger page.
 */

import { displayLedgerEntryType, formatPlainDatesInText } from '@/lib/display-labels';
import { AppError } from '@/lib/errors';
import { formatUsdt, usdtToMinor } from '@/lib/money';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { listSuppliers } from '@/modules/supplier';
import { getWallet, listResellerWallets } from '@/modules/wallet';

export type MoneyFilters = {
  readonly kind?: string;
  readonly walletId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly q?: string;
};

export type MoneyWalletItem = {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly available: string;
  readonly reserved: string;
  readonly total: string;
  readonly owesYou: string;
};

export type MoneyLedgerItem = {
  readonly id: string;
  readonly walletId: string;
  readonly accountName: string;
  readonly kind: string;
  readonly kindLabel: string;
  readonly amount: string;
  readonly amountMinor: string;
  readonly note: string;
  readonly at: string;
};

export type MoneyDebtItem = {
  readonly orderId: string;
  readonly shortId: string;
  readonly tenantId: string;
  readonly storeName: string;
  readonly productTitle: string;
  readonly retail: string;
  readonly owed: string;
  readonly fundingLabel: string;
  readonly at: string;
};

export type MoneyPayload = {
  readonly role: 'owner' | 'reseller';
  readonly ownerBalance: string;
  readonly customerWallets: string;
  readonly resellerDebt: string;
  readonly pendingOrders: string;
  readonly suppliers: readonly { readonly id: string; readonly name: string; readonly balance: string; readonly warning: boolean }[];
  readonly wallets: readonly MoneyWalletItem[];
  readonly ledger: readonly MoneyLedgerItem[];
  readonly debts: readonly MoneyDebtItem[];
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

function safeRecords(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error || !Array.isArray(result.data)) {
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

function safeUsdtMinor(raw: string | null | undefined): bigint {
  const cleaned = (raw ?? '').trim();
  if (!cleaned) return 0n;
  try {
    return usdtToMinor(cleaned);
  } catch {
    return 0n;
  }
}

function isWholesaleOwedOrder(row: Record<string, unknown>): boolean {
  const funding = text(row.funding_status);
  const payment = text(row.payment_status);
  return funding === 'reserved' || (payment === 'verified' && funding === 'not_applicable');
}

function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function readMoney(
  db: DbClient,
  scope: { readonly role: 'owner' | 'reseller'; readonly tenantId: string | null },
  kindOrFilters: string | MoneyFilters = {},
): Promise<MoneyPayload> {
  if (scope.role === 'reseller' && !scope.tenantId) {
    const zero = formatUsdt(0n);
    return {
      role: 'reseller',
      ownerBalance: zero,
      customerWallets: zero,
      resellerDebt: zero,
      pendingOrders: zero,
      suppliers: [],
      wallets: [],
      ledger: [],
      debts: [],
    };
  }
  const filters: MoneyFilters =
    typeof kindOrFilters === 'string' ? { kind: kindOrFilters } : kindOrFilters;

  const pendingQuery = scope.tenantId
    ? db.from('orders').select('quoted_wholesale_price, fulfillment_status').eq('fulfillment_status', 'supplier_pending').eq('tenant_id', scope.tenantId).limit(500)
    : db.from('orders').select('quoted_wholesale_price, fulfillment_status').eq('fulfillment_status', 'supplier_pending').limit(500);
  const pending = records((await pendingQuery) as QueryResult<unknown>);
  const pendingMinor = pending.reduce((sum, row) => sum + minor(row.quoted_wholesale_price), 0n);

  const suppliers = scope.role === 'owner' ? await listSuppliers(db) : [];
  const supplierRows = suppliers.map((supplier) => {
    const balanceMinor = safeUsdtMinor(supplier.balanceUsdt);
    return {
      id: supplier.id,
      name: supplier.name,
      balance: formatUsdt(balanceMinor),
      warning: balanceMinor < pendingMinor,
    };
  });

  let owedOrdersQuery = db
    .from('orders')
    .select('id, tenant_id, product_id, quoted_retail_price, quoted_wholesale_price, funding_status, payment_status, created_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (scope.role === 'reseller' && scope.tenantId) {
    owedOrdersQuery = owedOrdersQuery.eq('tenant_id', scope.tenantId);
  }
  const allOrderRows = records((await owedOrdersQuery) as QueryResult<unknown>);
  const debtOrders = allOrderRows.filter((row) => text(row.tenant_id) && isWholesaleOwedOrder(row));

  const debtByTenant = new Map<string, bigint>();
  for (const row of debtOrders) {
    const tid = text(row.tenant_id);
    debtByTenant.set(tid, (debtByTenant.get(tid) ?? 0n) + minor(row.quoted_wholesale_price));
  }

  let wallets: MoneyWalletItem[] = [];
  let ownerBalance = formatUsdt(0n);
  let resellerDebt = formatUsdt(0n);

  if (scope.role === 'owner') {
    const listed = await listResellerWallets(db);
    wallets = listed.map((wallet) => ({
      id: wallet.walletId,
      tenantId: wallet.tenantId,
      name: wallet.tenantName,
      available: formatUsdt(wallet.balanceAvailable),
      reserved: formatUsdt(wallet.balanceReserved),
      total: formatUsdt(wallet.balanceTotal),
      owesYou: formatUsdt(debtByTenant.get(wallet.tenantId) ?? 0n),
    }));
    const debtTotalMinor = debtOrders.reduce((sum, row) => sum + minor(row.quoted_wholesale_price), 0n);
    resellerDebt = formatUsdt(debtTotalMinor);
    const paid = records((await db.from('orders').select('quoted_retail_price').eq('payment_status', 'verified').is('tenant_id', null).limit(1000)) as QueryResult<unknown>);
    ownerBalance = formatUsdt(paid.reduce((sum, row) => sum + minor(row.quoted_retail_price), 0n));
  } else if (scope.tenantId) {
    try {
      const wallet = await getWallet(db, scope.tenantId);
      wallets = [
        {
          id: wallet.id,
          tenantId: scope.tenantId,
          name: 'Your wallet',
          available: formatUsdt(wallet.balanceAvailable),
          reserved: formatUsdt(wallet.balanceReserved),
          total: formatUsdt(wallet.balanceTotal),
          owesYou: formatUsdt(debtByTenant.get(scope.tenantId) ?? 0n),
        },
      ];
      ownerBalance = formatUsdt(wallet.balanceAvailable);
    } catch {
      wallets = [];
      ownerBalance = formatUsdt(0n);
    }
    resellerDebt = formatUsdt(debtByTenant.get(scope.tenantId) ?? 0n);
  }

  const tenantIds = [...new Set(debtOrders.map((row) => text(row.tenant_id)).filter(Boolean))];
  const productIds = [...new Set(debtOrders.slice(0, 100).map((row) => text(row.product_id)).filter(Boolean))];
  const [tenantsRes, productsRes] = await Promise.all([
    tenantIds.length
      ? (db.from('tenants').select('id, display_name, business_name').in('id', tenantIds).limit(200) as unknown as Promise<QueryResult<unknown>>)
      : Promise.resolve({ data: [], error: null } as QueryResult<unknown>),
    productIds.length
      ? (db.from('products').select('id, title').in('id', productIds).limit(200) as unknown as Promise<QueryResult<unknown>>)
      : Promise.resolve({ data: [], error: null } as QueryResult<unknown>),
  ]);

  const tenantNames = new Map<string, string>();
  for (const row of safeRecords(tenantsRes)) {
    const tid = text(row.id);
    if (tid) tenantNames.set(tid, text(row.business_name) || text(row.display_name) || 'Reseller store');
  }
  const productNames = new Map<string, string>();
  for (const row of safeRecords(productsRes)) {
    const pid = text(row.id);
    if (pid) productNames.set(pid, text(row.title) || 'Product');
  }

  const debts: MoneyDebtItem[] = debtOrders.slice(0, 100).map((row) => {
    const oid = text(row.id);
    const tid = text(row.tenant_id);
    const funding = text(row.funding_status);
    return {
      orderId: oid,
      shortId: oid.slice(0, 8).toUpperCase(),
      tenantId: tid,
      storeName: tenantNames.get(tid) ?? 'Reseller store',
      productTitle: productNames.get(text(row.product_id)) ?? 'Digital item',
      retail: formatUsdt(minor(row.quoted_retail_price)),
      owed: formatUsdt(minor(row.quoted_wholesale_price)),
      fundingLabel: funding === 'reserved' ? 'Balance reserved' : 'Unsettled wholesale',
      at: text(row.created_at),
    };
  });

  let credits: Record<string, unknown>[] = [];
  if (scope.role === 'owner') {
    credits = records((await db.from('customers').select('credit_balance').limit(1000)) as QueryResult<unknown>);
  } else if (scope.tenantId) {
    const bots = records((await db.from('bot_connections').select('id').eq('tenant_id', scope.tenantId).limit(10)) as QueryResult<unknown>);
    const botIds = bots.map((b) => text(b.id)).filter(Boolean);
    if (botIds.length > 0) {
      credits = records((await db.from('customers').select('credit_balance').in('bot_id', botIds).limit(1000)) as QueryResult<unknown>);
    }
  }
  const customerWallets = formatUsdt(credits.reduce((sum, row) => sum + minor(row.credit_balance), 0n));

  const fromIso = filters.from?.trim() ? `${filters.from.trim().slice(0, 10)}T00:00:00.000Z` : '';
  const toIso = filters.to?.trim() ? `${filters.to.trim().slice(0, 10)}T23:59:59.999Z` : '';

  let ledgerQuery = db
    .from('ledger_transactions')
    .select('id, wallet_id, entry_type, amount, note, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filters.kind) {
    ledgerQuery = ledgerQuery.eq('entry_type', filters.kind);
  }
  if (scope.role === 'reseller') {
    if (wallets[0]) {
      ledgerQuery = ledgerQuery.eq('wallet_id', wallets[0].id);
    }
  } else if (filters.walletId) {
    ledgerQuery = ledgerQuery.eq('wallet_id', filters.walletId);
  }
  if (fromIso) {
    ledgerQuery = ledgerQuery.gte('created_at', fromIso);
  }
  if (toIso) {
    ledgerQuery = ledgerQuery.lte('created_at', toIso);
  }

  const ledgerResult = (await ledgerQuery) as QueryResult<unknown>;
  const ledgerRows =
    scope.role === 'reseller' && !wallets[0]
      ? []
      : ledgerResult.error
        ? []
        : records(ledgerResult);

  const walletNameMap = new Map(wallets.map((w) => [w.id, w.name]));
  const qLower = (filters.q ?? '').trim().toLowerCase();

  const ledger: MoneyLedgerItem[] = ledgerRows
    .map((row) => {
      const wid = text(row.wallet_id);
      const kind = text(row.entry_type);
      const amountVal = minor(row.amount);
      const accountName = walletNameMap.get(wid) ?? (scope.role === 'reseller' ? 'Your wallet' : 'Reseller wallet');
      const kindLabel = displayLedgerEntryType(kind);
      const note = formatPlainDatesInText(text(row.note));
      return {
        id: text(row.id),
        walletId: wid,
        accountName,
        kind,
        kindLabel,
        amount: formatUsdt(amountVal),
        amountMinor: amountVal.toString(),
        note,
        at: text(row.created_at),
      };
    })
    .filter((entry) => {
      if (!qLower) return true;
      const hay = `${entry.id} ${entry.accountName} ${entry.kindLabel} ${entry.note}`.toLowerCase();
      return hay.includes(qLower);
    });

  return {
    role: scope.role,
    ownerBalance,
    customerWallets,
    resellerDebt,
    pendingOrders: formatUsdt(pendingMinor),
    suppliers: supplierRows,
    wallets,
    ledger,
    debts,
  };
}

export function moneyCsv(payload: MoneyPayload): string {
  const header = 'id,account,type,amount,note,created_at';
  const body = payload.ledger.map((row) =>
    [row.id, row.accountName, row.kindLabel, row.amount, row.note, row.at].map(csvCell).join(','),
  );
  return [header, ...body].join('\n');
}
