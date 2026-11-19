'use client';

/**
 * Money. Top-up review is the existing panel, moved here unchanged.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopupAdmin } from '@/components/dashboard/topup-admin';
import { useSetDrawerBody } from '@/components/platform/drawer-body';
import { Card, DataTable, ErrorState, FilterBar, RelativeTime, SelectField, StatTile, StatusPill, type Column } from '@/components/platform/ui';
import { displayLedgerEntryType } from '@/lib/display-labels';
import { useData } from '@/lib/hooks/use-data';

type MoneyPayload = {
  readonly role: 'owner' | 'reseller';
  readonly ownerBalance: string;
  readonly customerWallets: string;
  readonly resellerDebt: string;
  readonly pendingOrders: string;
  readonly suppliers: readonly { readonly id: string; readonly name: string; readonly balance: string; readonly warning: boolean }[];
  readonly wallets: readonly { readonly id: string; readonly name: string; readonly available: string; readonly reserved: string }[];
  readonly ledger: readonly { readonly id: string; readonly kind: string; readonly amount: string; readonly at: string }[];
};

const KINDS = [
  { value: '', label: 'Every entry' },
  { value: 'top_up_credit', label: 'Top-up' },
  { value: 'manual_credit', label: 'Manual credit' },
  { value: 'manual_debit', label: 'Manual debit' },
  { value: 'wholesale_debit', label: 'Wholesale' },
  { value: 'wholesale_reversal', label: 'Reversal' },
];

export function MoneyView({ focus = 'all' }: { readonly focus?: 'all' | 'wallets' | 'payments' } = {}): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const setDrawer = useSetDrawerBody();
  const kind = params.get('kind') ?? '';
  const walletId = params.get('wallet') ?? '';
  const money = useData<MoneyPayload>(`/api/platform/money${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`);
  const wallet = money.data?.wallets.find((row) => row.id === walletId) ?? null;

  useEffect(() => {
    if (!walletId) {
      setDrawer(null);
      return;
    }
    setDrawer(
      wallet ? (
        <div className="space-y-2 text-sm">
          <h2 className="text-lg text-ink">{wallet.name}</h2>
          <p className="font-num text-ink">Available {wallet.available}</p>
          <p className="font-num text-ink">Reserved {wallet.reserved}</p>
        </div>
      ) : (
        <p className="text-sm text-ink-soft">This wallet is not in the current list.</p>
      ),
    );
    return () => setDrawer(null);
  }, [walletId, wallet, setDrawer]);
  const walletColumns: Column<MoneyPayload['wallets'][number]>[] = [
    { id: 'name', header: 'Account', render: (row) => row.name },
    { id: 'available', header: 'Available', numeric: true, render: (row) => row.available },
    { id: 'reserved', header: 'Reserved', numeric: true, render: (row) => row.reserved },
  ];
  const ledgerColumns: Column<MoneyPayload['ledger'][number]>[] = [
    { id: 'kind', header: 'Entry', render: (row) => displayLedgerEntryType(row.kind) },
    { id: 'amount', header: 'Amount', numeric: true, render: (row) => row.amount },
    { id: 'at', header: 'When', render: (row) => <RelativeTime value={row.at} /> },
  ];

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl text-ink">{focus === 'payments' ? 'Payments' : 'Wallets & ledger'}</h1>
          <p className="mt-1 text-sm text-ink-soft">{focus === 'payments' ? 'Top-ups and payment review.' : 'Balances and the ledger.'}</p>
        </div>
        <a className="inline-flex min-h-11 items-center rounded-md border border-stroke px-3 text-sm text-ink" href={`/api/platform/money?format=csv${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`}>Export ledger</a>
      </header>
      {money.loading ? <p className="text-sm text-ink-soft">Loading balances…</p> : null}
      {money.error ? <ErrorState message={money.error.message} requestId={money.error.requestId} detail={money.error.detail} onRetry={money.refetch} /> : null}
      {money.data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <StatTile label={money.data.role === 'owner' ? 'Owner store' : 'Available'} value={money.data.ownerBalance} />
            <StatTile label="Customer wallets" value={money.data.customerWallets} />
            <StatTile label="Reseller debt" value={money.data.resellerDebt} />
            <StatTile label="Pending supplier orders" value={money.data.pendingOrders} />
          </div>
          {money.data.suppliers.length > 0 ? (
            <Card title="Supplier balances">
              <ul className="space-y-2">
                {money.data.suppliers.map((supplier) => (
                  <li key={supplier.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-ink">{supplier.name}</span>
                    <span className="font-num text-ink">{supplier.balance}</span>
                    {supplier.warning ? <StatusPill tone="warn">Would not cover pending orders</StatusPill> : <StatusPill tone="ok">Covers pending orders</StatusPill>}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {focus !== 'payments' ? (
          <>
          <Card title="Wallets">
            <DataTable caption="Wallets" columns={walletColumns} rows={money.data.wallets} rowKey={(row) => row.id} emptyTitle="No wallets yet" emptyMessage="A reseller wallet appears here after the first top-up." onOpen={(row) => { const next = new URLSearchParams(params.toString()); next.set('wallet', row.id); router.replace(`/wallets?${next}`); }} />
          </Card>
          <FilterBar>
            <SelectField id="ledger-kind" label="Ledger" value={kind} options={KINDS} onChange={(event) => { const next = new URLSearchParams(params.toString()); if (event.target.value) next.set('kind', event.target.value); else next.delete('kind'); router.replace(`/wallets${next.toString() ? `?${next}` : ''}`); }} />
          </FilterBar>
          <DataTable caption="Ledger" columns={ledgerColumns} rows={money.data.ledger} rowKey={(row) => row.id} emptyTitle="No ledger entries" emptyMessage="Credits and debits will list here." />
          </>
          ) : null}
        </>
      ) : null}
      {focus !== 'wallets' ? (
      <Card title="Top-ups">
        <TopupAdmin />
      </Card>
      ) : null}
    </section>
  );
}
