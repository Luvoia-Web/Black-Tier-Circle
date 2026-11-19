'use client';

/**
 * @file app/(platform)/wallets/view.tsx
 *
 * Wallets & ledger page (separate from Payments):
 * - Wallets & balances (owner sees all reseller wallets + supplier coverage; reseller sees own wallet)
 * - Filtered ledger (entry type, wallet, date range, search) + CSV export
 * - Top-up credit tokens (owner creates/lists/revokes; reseller redeems)
 * - Wholesale debts per unsettled order
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Coins, CreditCard, ReceiptText, Wallet as WalletIcon } from 'lucide-react';
import { useSetDrawerBody } from '@/components/platform/drawer-body';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  RelativeTime,
  SelectField,
  Skeleton,
  StatTile,
  StatusPill,
  TextField,
  type Column,
} from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { formatUsdt } from '@/lib/money';
import { API_ROUTES } from '@/lib/navigation';
import type {
  MoneyDebtItem,
  MoneyLedgerItem,
  MoneyPayload,
  MoneyWalletItem,
} from '@/modules/platform/money';

type WalletSection = 'wallets' | 'ledger' | 'tokens' | 'debts';

type TokenRow = {
  readonly id: string;
  readonly token: string;
  readonly amountUsdt: string;
  readonly status: 'active' | 'redeemed' | 'expired' | 'revoked';
  readonly tenantId: string | null;
  readonly expiresAt: string | null;
  readonly redeemedAt: string | null;
  readonly createdAt: string;
};

const SECTIONS: ReadonlyArray<{ readonly id: WalletSection; readonly label: string }> = [
  { id: 'wallets', label: 'Wallets' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'tokens', label: 'Top-up tokens' },
  { id: 'debts', label: 'Debts' },
];

const LEDGER_KINDS = [
  { value: '', label: 'All entry types' },
  { value: 'top_up_credit', label: 'Top-up credit' },
  { value: 'manual_credit', label: 'Manual credit' },
  { value: 'manual_debit', label: 'Manual debit' },
  { value: 'wholesale_debit', label: 'Wholesale charge' },
  { value: 'wholesale_reversal', label: 'Wholesale reversal' },
  { value: 'reservation', label: 'Balance reserved' },
  { value: 'reservation_release', label: 'Reservation released' },
] as const;

const TOKEN_STATUS_CHIPS = [
  { id: '', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'redeemed', label: 'Redeemed' },
  { id: 'expired', label: 'Expired' },
  { id: 'revoked', label: 'Revoked' },
] as const;

function parseSection(value: string | null): WalletSection {
  if (value === 'ledger' || value === 'tokens' || value === 'debts') return value;
  return 'wallets';
}

function formatTokenAmount(minorStr: string): string {
  try {
    return formatUsdt(BigInt(minorStr));
  } catch {
    return '0.00 USDT';
  }
}

function tokenStatusLabel(status: TokenRow['status']): string {
  if (status === 'active') return 'Active';
  if (status === 'redeemed') return 'Redeemed';
  if (status === 'expired') return 'Expired';
  return 'Revoked';
}

function WalletDetailDrawer({
  wallet,
  ledger,
  onDone,
}: {
  readonly wallet: MoneyWalletItem;
  readonly ledger: readonly MoneyLedgerItem[];
  readonly onDone: () => void;
}): JSX.Element {
  const [action, setAction] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function submitAdjustment(): Promise<void> {
    setBusy(true);
    setFeedback('');
    const url =
      action === 'credit'
        ? API_ROUTES.adminWalletCredit(wallet.id)
        : API_ROUTES.adminWalletDebit(wallet.id);
    const result = await runAction(url, {
      method: 'POST',
      body: { amountUsdtStr: amount.trim(), note: note.trim() },
    });
    setBusy(false);
    if (!result.ok) {
      setFeedback(result.error.message);
      return;
    }
    setAmount('');
    setNote('');
    setFeedback(action === 'credit' ? 'Credit added to wallet.' : 'Debit recorded on wallet.');
    onDone();
  }

  const recentEntries = ledger.filter((row) => row.walletId === wallet.id).slice(0, 10);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-medium text-ink">{wallet.name}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">Reseller wholesale wallet</p>
        </div>
        <Link
          href={`/resellers?reseller=${wallet.tenantId}`}
          className="text-xs font-medium text-rose hover:underline"
        >
          Open store
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-stroke bg-white/[0.03] p-2.5">
          <p className="text-[11px] text-ink-faint">Available</p>
          <p className="mt-0.5 font-num text-base font-medium text-ink">{wallet.available}</p>
        </div>
        <div className="rounded-md border border-stroke bg-white/[0.03] p-2.5">
          <p className="text-[11px] text-ink-faint">Reserved</p>
          <p className="mt-0.5 font-num text-base font-medium text-ink">{wallet.reserved}</p>
        </div>
        <div className="rounded-md border border-stroke bg-white/[0.03] p-2.5">
          <p className="text-[11px] text-ink-faint">Total balance</p>
          <p className="mt-0.5 font-num text-base font-medium text-ink">{wallet.total}</p>
        </div>
        <div className="rounded-md border border-stroke bg-white/[0.03] p-2.5">
          <p className="text-[11px] text-ink-faint">Wholesale owed</p>
          <p className="mt-0.5 font-num text-base font-medium text-amber">{wallet.owesYou}</p>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-stroke p-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Adjust wallet balance</h3>
        <SelectField
          id="wallet-adjust-kind"
          label="Adjustment type"
          value={action}
          options={[
            { value: 'credit', label: 'Credit wallet' },
            { value: 'debit', label: 'Debit wallet' },
          ]}
          onChange={(event) => setAction(event.target.value === 'debit' ? 'debit' : 'credit')}
        />
        <TextField
          id="wallet-adjust-amount"
          label="Amount (USDT)"
          placeholder="25.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <TextField
          id="wallet-adjust-note"
          label="Reason"
          placeholder="Manual settlement or correction"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {feedback ? <p className="text-xs text-ink-soft">{feedback}</p> : null}
        <Button
          variant={action === 'debit' ? 'destructive' : 'primary'}
          loading={busy}
          disabled={!amount.trim() || !note.trim()}
          onClick={() => void submitAdjustment()}
        >
          {action === 'credit' ? 'Credit wallet' : 'Debit wallet'}
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Recent ledger entries</h3>
        {recentEntries.length === 0 ? (
          <p className="text-xs text-ink-soft">No ledger entries recorded for this wallet yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentEntries.map((entry) => (
              <li key={entry.id} className="rounded-md border border-stroke px-2.5 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{entry.kindLabel}</span>
                  <span className="font-num tabular-nums text-ink">{entry.amount}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-ink-faint">
                  <span className="truncate">{entry.note || 'Ledger transaction'}</span>
                  <RelativeTime value={entry.at} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ResellerRedeemCard({ onRedeemed }: { readonly onRedeemed: () => void }): JSX.Element {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isError, setIsError] = useState(false);

  async function redeem(): Promise<void> {
    setBusy(true);
    setFeedback('');
    setIsError(false);
    const result = await runAction<{ readonly amountCredited: string }>(API_ROUTES.walletRedeem, {
      method: 'POST',
      body: { token: code.replace(/\s+/g, '') },
    });
    setBusy(false);
    if (!result.ok) {
      setIsError(true);
      setFeedback(result.error.message);
      return;
    }
    setCode('');
    setFeedback('Token redeemed and added to your available wallet balance.');
    onRedeemed();
  }

  return (
    <Card title="Redeem a credit token">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <TextField
            id="reseller-redeem-token"
            label="12-digit top-up token"
            placeholder="000000000000"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <Button loading={busy} disabled={code.replace(/\s+/g, '').length !== 12} onClick={() => void redeem()}>
          Redeem token
        </Button>
      </div>
      {feedback ? (
        <p className="mt-2 text-xs" style={isError ? { color: 'var(--fault-ink)' } : { color: 'var(--ok)' }}>
          {feedback}
        </p>
      ) : null}
    </Card>
  );
}

export function WalletsView(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const setDrawer = useSetDrawerBody();

  const section = parseSection(params.get('section'));
  const kind = params.get('kind') ?? '';
  const walletFilter = section === 'ledger' ? (params.get('filterWallet') ?? '') : '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const q = params.get('q') ?? '';
  const walletDrawerId = params.get('wallet') ?? '';

  const [tokenStatusFilter, setTokenStatusFilter] = useState<string>('');
  const [newTokenAmount, setNewTokenAmount] = useState('');
  const [newTokenTenant, setNewTokenTenant] = useState('');
  const [newTokenDays, setNewTokenDays] = useState('7');
  const [tokenBusy, setTokenBusy] = useState(false);
  const [createdToken, setCreatedToken] = useState<{ readonly token: string; readonly amount: string } | null>(null);
  const [tokenFeedback, setTokenFeedback] = useState('');

  const moneyUrl = `/api/platform/money?${new URLSearchParams({
    ...(kind ? { kind } : {}),
    ...(walletFilter ? { wallet: walletFilter } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(q ? { q } : {}),
  }).toString()}`;

  const money = useData<MoneyPayload>(moneyUrl);
  const isOwner = money.data?.role === 'owner';

  const tokensUrl =
    isOwner && section === 'tokens'
      ? `/api/admin/tokens${tokenStatusFilter ? `?status=${encodeURIComponent(tokenStatusFilter)}` : ''}`
      : null;
  const tokens = useData<readonly TokenRow[]>(tokensUrl);

  function updateParams(changes: Record<string, string | null>): void {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `/wallets?${qs}` : '/wallets');
  }

  const activeWallet = money.data?.wallets.find((row) => row.id === walletDrawerId) ?? null;
  const { refetch: refetchMoney } = money;

  useEffect(() => {
    if (!walletDrawerId || !isOwner) {
      setDrawer(null);
      return;
    }
    setDrawer(
      activeWallet ? (
        <WalletDetailDrawer
          wallet={activeWallet}
          ledger={money.data?.ledger ?? []}
          onDone={() => refetchMoney()}
        />
      ) : (
        <p className="text-sm text-ink-soft">This wallet is not in the current list.</p>
      ),
    );
    return () => setDrawer(null);
  }, [walletDrawerId, isOwner, activeWallet, money.data?.ledger, refetchMoney, setDrawer]);

  async function issueToken(): Promise<void> {
    setTokenBusy(true);
    setTokenFeedback('');
    setCreatedToken(null);
    const days = Number(newTokenDays);
    const expiresAt =
      Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : undefined;
    const result = await runAction<{ readonly token: string; readonly amountUsdt: string }>(API_ROUTES.adminTokens, {
      method: 'POST',
      body: {
        amountUsdtStr: newTokenAmount.trim(),
        ...(newTokenTenant ? { tenantId: newTokenTenant } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      },
    });
    setTokenBusy(false);
    if (!result.ok) {
      setTokenFeedback(result.error.message);
      return;
    }
    setCreatedToken({
      token: result.data.token,
      amount: formatTokenAmount(String(result.data.amountUsdt)),
    });
    setNewTokenAmount('');
    tokens.refetch();
  }

  async function revokeToken(id: string): Promise<void> {
    setTokenFeedback('');
    const result = await runAction(API_ROUTES.adminTokenRevoke(id), { method: 'POST' });
    if (!result.ok) {
      setTokenFeedback(result.error.message);
      return;
    }
    setTokenFeedback('Credit token revoked.');
    tokens.refetch();
  }

  const csvUrl = `/api/platform/money?${new URLSearchParams({
    format: 'csv',
    ...(kind ? { kind } : {}),
    ...(walletFilter ? { wallet: walletFilter } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(q ? { q } : {}),
  }).toString()}`;

  const walletColumns: Column<MoneyWalletItem>[] = [
    { id: 'name', header: 'Account', render: (row) => row.name },
    { id: 'available', header: 'Available', numeric: true, render: (row) => row.available },
    { id: 'reserved', header: 'Reserved', numeric: true, render: (row) => row.reserved },
    { id: 'total', header: 'Total', numeric: true, render: (row) => row.total },
    { id: 'owesYou', header: 'Wholesale owed', numeric: true, render: (row) => row.owesYou },
  ];

  const ledgerColumns: Column<MoneyLedgerItem>[] = [
    ...(isOwner ? [{ id: 'account', header: 'Account', render: (row: MoneyLedgerItem) => row.accountName }] : []),
    { id: 'kind', header: 'Entry', render: (row) => row.kindLabel },
    { id: 'amount', header: 'Amount', numeric: true, render: (row) => row.amount },
    { id: 'note', header: 'Note', render: (row) => row.note || 'Ledger entry' },
    { id: 'at', header: 'When', render: (row) => <RelativeTime value={row.at} /> },
  ];

  const debtColumns: Column<MoneyDebtItem>[] = [
    {
      id: 'order',
      header: 'Order',
      render: (row) => (
        <Link href={`/orders?order=${row.orderId}`} className="font-num font-medium text-ink hover:underline">
          #{row.shortId}
        </Link>
      ),
    },
    ...(isOwner ? [{ id: 'store', header: 'Store', render: (row: MoneyDebtItem) => row.storeName }] : []),
    { id: 'product', header: 'Product', render: (row) => row.productTitle },
    { id: 'retail', header: 'Retail', numeric: true, render: (row) => row.retail },
    { id: 'owed', header: 'Wholesale owed', numeric: true, render: (row) => row.owed },
    { id: 'status', header: 'Funding', render: (row) => <StatusPill tone="warn">{row.fundingLabel}</StatusPill> },
    { id: 'at', header: 'When', render: (row) => <RelativeTime value={row.at} /> },
  ];

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">Wallets & ledger</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {isOwner
              ? 'Reseller balances, credit tokens, filtered ledger history, and wholesale debts.'
              : 'Your balance, credit token redemption, ledger history, and wholesale bills.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/payments"
            className="inline-flex h-[38px] items-center rounded-xl border border-white/12 bg-white/[0.07] px-3 text-[13.5px] font-medium text-ink hover:bg-white/10"
          >
            Payments & BEP20
          </Link>
          <a
            href={csvUrl}
            className="inline-flex h-[38px] items-center rounded-xl border border-white/12 bg-white/[0.07] px-3 text-[13.5px] font-medium text-ink hover:bg-white/10"
          >
            Export ledger CSV
          </a>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => updateParams({ section: item.id === 'wallets' ? null : item.id })}
            className={`inline-flex h-10 items-center rounded-pill px-4 text-sm font-medium transition ${
              section === item.id ? 'bg-rose text-white' : 'border border-stroke text-ink-soft hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {money.loading && !money.data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : money.error ? (
        <ErrorState message={money.error.message} requestId={money.error.requestId} detail={money.error.detail} onRetry={money.refetch} />
      ) : money.data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
            <StatTile
              label={isOwner ? 'Owner store revenue' : 'Available balance'}
              value={money.data.ownerBalance}
              icon={WalletIcon}
              tone="rose"
            />
            <StatTile label="Customer wallets" value={money.data.customerWallets} icon={CreditCard} tone="sky" />
            <StatTile label="Wholesale owed" value={money.data.resellerDebt} icon={ReceiptText} tone="amber" />
            <StatTile label="Pending supplier cost" value={money.data.pendingOrders} icon={Coins} tone="mint" />
          </div>

          {section === 'wallets' ? (
            <div className="space-y-4">
              {money.data.suppliers.length > 0 ? (
                <Card title="Supplier balances">
                  <ul className="space-y-2">
                    {money.data.suppliers.map((supplier) => (
                      <li key={supplier.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-ink">{supplier.name}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-num text-ink">{supplier.balance}</span>
                          {supplier.warning ? (
                            <StatusPill tone="warn">Would not cover pending orders</StatusPill>
                          ) : (
                            <StatusPill tone="ok">Covers pending orders</StatusPill>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              <Card title={isOwner ? 'Reseller wallets' : 'Your wallet'}>
                <DataTable<MoneyWalletItem>
                  caption="Wallets"
                  columns={walletColumns}
                  rows={money.data.wallets}
                  rowKey={(row) => row.id}
                  emptyTitle="No wallets yet"
                  emptyMessage="A reseller wallet appears here after activation or the first top-up."
                  {...(isOwner ? { onOpen: (row) => updateParams({ wallet: row.id }) } : {})}
                />
              </Card>

              {!isOwner ? <ResellerRedeemCard onRedeemed={money.refetch} /> : null}
            </div>
          ) : null}

          {section === 'ledger' ? (
            <div className="space-y-4">
              <FilterBar>
                <SelectField
                  id="ledger-kind"
                  label="Entry type"
                  value={kind}
                  options={[...LEDGER_KINDS]}
                  onChange={(event) => updateParams({ kind: event.target.value || null })}
                />
                {isOwner ? (
                  <SelectField
                    id="ledger-wallet"
                    label="Account"
                    value={walletFilter}
                    options={[
                      { value: '', label: 'All wallets' },
                      ...money.data.wallets.map((w) => ({ value: w.id, label: w.name })),
                    ]}
                    onChange={(event) => updateParams({ filterWallet: event.target.value || null })}
                  />
                ) : null}
                <TextField
                  id="ledger-search"
                  label="Search note or account"
                  placeholder="Filter ledger"
                  value={q}
                  onChange={(event) => updateParams({ q: event.target.value || null })}
                />
                <TextField
                  id="ledger-from"
                  label="From date"
                  type="date"
                  value={from}
                  onChange={(event) => updateParams({ from: event.target.value || null })}
                />
                <TextField
                  id="ledger-to"
                  label="To date"
                  type="date"
                  value={to}
                  onChange={(event) => updateParams({ to: event.target.value || null })}
                />
              </FilterBar>

              <Card title={`Ledger entries (${money.data.ledger.length})`}>
                <DataTable
                  caption="Ledger"
                  columns={ledgerColumns}
                  rows={money.data.ledger}
                  rowKey={(row) => row.id}
                  emptyTitle="No ledger entries match"
                  emptyMessage="Try widening your date range or clearing filters."
                />
              </Card>
            </div>
          ) : null}

          {section === 'tokens' ? (
            isOwner ? (
              <div className="space-y-4">
                <Card title="Issue credit token">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <TextField
                      id="new-token-amount"
                      label="Amount (USDT)"
                      placeholder="50.00"
                      value={newTokenAmount}
                      onChange={(event) => setNewTokenAmount(event.target.value)}
                    />
                    <SelectField
                      id="new-token-tenant"
                      label="Restrict to reseller (optional)"
                      value={newTokenTenant}
                      options={[
                        { value: '', label: 'Any reseller store' },
                        ...money.data.wallets.map((w) => ({ value: w.tenantId, label: w.name })),
                      ]}
                      onChange={(event) => setNewTokenTenant(event.target.value)}
                    />
                    <TextField
                      id="new-token-days"
                      label="Expires in days"
                      placeholder="7"
                      value={newTokenDays}
                      onChange={(event) => setNewTokenDays(event.target.value)}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button loading={tokenBusy} disabled={!newTokenAmount.trim()} onClick={() => void issueToken()}>
                      Create token
                    </Button>
                    {tokenFeedback ? <span className="text-xs text-ink-soft">{tokenFeedback}</span> : null}
                  </div>
                  {createdToken ? (
                    <div className="mt-3 rounded-md border border-mint/40 bg-mint/10 p-3 text-xs">
                      <p className="font-medium text-ink">Credit token ready ({createdToken.amount}):</p>
                      <p className="mt-1 font-mono text-sm text-ink">{createdToken.token}</p>
                    </div>
                  ) : null}
                </Card>

                <Card
                  title="Top-up tokens"
                  action={
                    <div className="flex flex-wrap gap-1.5">
                      {TOKEN_STATUS_CHIPS.map((chip) => (
                        <button
                          key={chip.id || 'all'}
                          type="button"
                          onClick={() => setTokenStatusFilter(chip.id)}
                          className={`rounded-pill px-2.5 py-1 text-xs transition ${
                            tokenStatusFilter === chip.id ? 'bg-rose text-white' : 'border border-stroke text-ink-soft hover:text-ink'
                          }`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  }
                >
                  {tokens.loading && !tokens.data ? (
                    <Skeleton className="h-32 w-full" />
                  ) : tokens.error ? (
                    <ErrorState message={tokens.error.message} onRetry={tokens.refetch} />
                  ) : !tokens.data || tokens.data.length === 0 ? (
                    <EmptyState title="No credit tokens" message="Create a 12-digit token above to credit a reseller wallet." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[540px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-stroke text-xs text-ink-faint">
                            <th className="py-2 pr-3 font-normal">Token</th>
                            <th className="px-2 py-2 text-right font-normal">Amount</th>
                            <th className="px-2 py-2 font-normal">Store</th>
                            <th className="px-2 py-2 font-normal">Status</th>
                            <th className="px-2 py-2 font-normal">Created</th>
                            <th className="pl-2 py-2 text-right font-normal">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tokens.data.map((row) => {
                            const storeName =
                              row.tenantId
                                ? (money.data?.wallets.find((w) => w.tenantId === row.tenantId)?.name ?? 'Assigned store')
                                : 'Any reseller';
                            return (
                              <tr key={row.id} className="border-b border-stroke/60">
                                <td className="py-2.5 pr-3 font-num text-ink">••••{row.token.slice(-4)}</td>
                                <td className="px-2 py-2.5 text-right font-num text-ink">{formatTokenAmount(String(row.amountUsdt))}</td>
                                <td className="px-2 py-2.5 text-ink-soft">
                                  <Badge>{storeName}</Badge>
                                </td>
                                <td className="px-2 py-2.5">
                                  <StatusPill
                                    tone={
                                      row.status === 'active'
                                        ? 'info'
                                        : row.status === 'redeemed'
                                          ? 'ok'
                                          : 'neutral'
                                    }
                                  >
                                    {tokenStatusLabel(row.status)}
                                  </StatusPill>
                                </td>
                                <td className="px-2 py-2.5 text-xs">
                                  <RelativeTime value={row.createdAt} />
                                </td>
                                <td className="pl-2 py-2.5 text-right">
                                  {row.status === 'active' ? (
                                    <Button variant="secondary" onClick={() => void revokeToken(row.id)}>
                                      Revoke
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-ink-faint">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            ) : (
              <ResellerRedeemCard onRedeemed={money.refetch} />
            )
          ) : null}

          {section === 'debts' ? (
            <Card title="Wholesale debts">
              <p className="mb-3 text-xs text-ink-soft">
                Orders whose wholesale balance is reserved or awaiting settlement against a reseller wallet.
              </p>
              <DataTable
                caption="Wholesale debts"
                columns={debtColumns}
                rows={money.data.debts}
                rowKey={(row) => row.orderId}
                emptyTitle="No unsettled wholesale debts"
                emptyMessage="All reseller orders in scope have settled their wholesale cost."
              />
            </Card>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
