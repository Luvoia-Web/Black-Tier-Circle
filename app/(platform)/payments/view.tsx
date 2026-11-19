'use client';

/**
 * @file app/(platform)/payments/view.tsx
 *
 * Dedicated Payments page (distinct from Wallets & ledger):
 * - BEP20 chain verification status, required confirmations, expiry window, receiving wallet
 * - Wallet top-ups monitor and review (via TopupAdmin)
 * - Owner order payment claims monitor with manual override modal
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, ShieldCheck, Wallet, Wifi } from 'lucide-react';
import { TopupAdmin } from '@/components/dashboard/topup-admin';
import {
  Badge,
  Button,
  Card,
  DataTable,
  ErrorState,
  Modal,
  RelativeTime,
  SelectField,
  Skeleton,
  StatTile,
  StatusPill,
  TextField,
  type Column,
} from '@/components/platform/ui';
import {
  displayOrderChannel,
  displayPaymentMethod,
  displayPaymentStatus,
} from '@/lib/display-labels';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES } from '@/lib/navigation';

type TopupHealthResponse = {
  readonly role?: 'owner' | 'reseller';
  readonly health: {
    readonly address: string | null;
    readonly addressValid: boolean;
    readonly cryptoEnabled: boolean;
    readonly notice: string | null;
    readonly provider: 'ok' | 'down';
    readonly confirmations: number;
    readonly expiryMinutes: number;
    readonly overrideActive: boolean;
  } | null;
};

type PaymentClaimRow = {
  readonly orderId: string;
  readonly channel: string;
  readonly productTitle: string;
  readonly amount: string;
  readonly method: string;
  readonly submittedAt: string;
  readonly paymentStatus: string;
};

type ClaimsResponse = {
  readonly rows: readonly PaymentClaimRow[];
  readonly modeLabel: string;
  readonly isDemoMode: boolean;
};

const CLAIM_TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'verified', label: 'Verified' },
  { id: 'failed', label: 'Failed' },
  { id: 'all', label: 'All' },
] as const;

function maskAddress(address: string | null): string {
  if (!address || address.length < 12) return 'Not configured';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function PaymentsView(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const sectionParam = params.get('section') === 'claims' ? 'claims' : 'topups';
  const claimTab = (params.get('tab') === 'verified' || params.get('tab') === 'failed' || params.get('tab') === 'all'
    ? params.get('tab')
    : 'pending') as 'pending' | 'verified' | 'failed' | 'all';

  const [overrideTarget, setOverrideTarget] = useState<PaymentClaimRow | null>(null);
  const [overrideAction, setOverrideAction] = useState<'verify' | 'fail'>('verify');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideFeedback, setOverrideFeedback] = useState('');

  const topupHealthData = useData<TopupHealthResponse>('/api/payments/topups?page=1&status=all&health=1');
  const isOwner = topupHealthData.data?.role === 'owner';
  const section = isOwner ? sectionParam : 'topups';

  const claims = useData<ClaimsResponse>(
    isOwner && section === 'claims' ? `${API_ROUTES.adminPayments}?tab=${claimTab}` : null,
  );

  function updateParams(changes: Record<string, string | null>): void {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `/payments?${qs}` : '/payments');
  }

  async function submitOverride(): Promise<void> {
    if (!overrideTarget) return;
    setOverrideBusy(true);
    setOverrideFeedback('');
    const result = await runAction(API_ROUTES.adminPaymentOverride(overrideTarget.orderId), {
      method: 'POST',
      body: {
        action: overrideAction,
        reason: overrideReason.trim(),
      },
    });
    setOverrideBusy(false);
    if (!result.ok) {
      setOverrideFeedback(result.error.message);
      return;
    }
    setOverrideTarget(null);
    setOverrideReason('');
    claims.refetch();
  }

  const health = topupHealthData.data?.health ?? null;

  const claimColumns: Column<PaymentClaimRow>[] = [
    {
      id: 'order',
      header: 'Order',
      render: (row) => (
        <Link href={`/orders?order=${row.orderId}`} className="font-num font-medium text-ink hover:underline">
          #{row.orderId.slice(0, 8).toUpperCase()}
        </Link>
      ),
    },
    { id: 'product', header: 'Product', render: (row) => row.productTitle },
    { id: 'channel', header: 'Channel', render: (row) => displayOrderChannel(row.channel) },
    { id: 'method', header: 'Method', render: (row) => displayPaymentMethod(row.method) },
    { id: 'amount', header: 'Amount', numeric: true, render: (row) => row.amount },
    {
      id: 'status',
      header: 'Status',
      render: (row) => (
        <StatusPill
          tone={
            row.paymentStatus === 'verified'
              ? 'ok'
              : row.paymentStatus === 'failed' || row.paymentStatus === 'expired'
                ? 'fault'
                : 'warn'
          }
        >
          {displayPaymentStatus(row.paymentStatus)}
        </StatusPill>
      ),
    },
    { id: 'submitted', header: 'Submitted', render: (row) => <RelativeTime value={row.submittedAt} /> },
    {
      id: 'action',
      header: 'Override',
      render: (row) => (
        <Button
          variant="secondary"
          onClick={() => {
            setOverrideTarget(row);
            setOverrideAction('verify');
            setOverrideReason('');
            setOverrideFeedback('');
          }}
        >
          Override
        </Button>
      ),
    },
  ];

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">Payments</h1>
          <p className="mt-1 text-sm text-ink-soft">
            BEP20 chain verification, buyer wallet top-ups, and order payment claims.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/wallets"
            className="inline-flex h-[38px] items-center rounded-xl border border-white/12 bg-white/[0.07] px-3 text-[13.5px] font-medium text-ink hover:bg-white/10"
          >
            Wallets & ledger
          </Link>
          <Link
            href={isOwner ? '/settings?section=payments' : '/settings?section=account'}
            className="inline-flex h-[38px] items-center rounded-xl border border-white/12 bg-white/[0.07] px-3 text-[13.5px] font-medium text-ink hover:bg-white/10"
          >
            Payment settings
          </Link>
        </div>
      </header>

      <Card
        title="BEP20 verification"
        action={
          health ? (
            <StatusPill tone={health.cryptoEnabled && health.addressValid ? 'ok' : 'warn'}>
              {health.cryptoEnabled && health.addressValid ? 'Active' : 'Check settings'}
            </StatusPill>
          ) : null
        }
      >
        {topupHealthData.loading && !health ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : health ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
              <StatTile
                label="BEP20 verifier"
                value={health.provider === 'ok' ? 'Online' : 'Offline'}
                icon={Wifi}
                tone={health.provider === 'ok' ? 'mint' : 'danger'}
              />
              <StatTile
                label="Required confirmations"
                value={String(health.confirmations)}
                hint={health.overrideActive ? 'Env override active' : 'Blocks'}
                icon={ShieldCheck}
                tone="rose"
              />
              <StatTile
                label="Top-up window"
                value={`${health.expiryMinutes} min`}
                icon={Clock}
                tone="sky"
              />
              <StatTile
                label="Receiving wallet"
                value={health.cryptoEnabled && health.addressValid ? 'Configured' : 'Disabled'}
                hint={maskAddress(health.address)}
                icon={Wallet}
                tone="amber"
              />
            </div>
            {health.notice ? (
              <p className="rounded-md border border-amber/35 bg-amber/10 px-3 py-2 text-xs text-ink" role="status">
                {health.notice}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      {isOwner ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => updateParams({ section: null, tab: null })}
            className={`inline-flex h-10 items-center rounded-pill px-4 text-sm font-medium transition ${
              section === 'topups' ? 'bg-rose text-white' : 'border border-stroke text-ink-soft hover:text-ink'
            }`}
          >
            Wallet top-ups
          </button>
          <button
            type="button"
            onClick={() => updateParams({ section: 'claims' })}
            className={`inline-flex h-10 items-center rounded-pill px-4 text-sm font-medium transition ${
              section === 'claims' ? 'bg-rose text-white' : 'border border-stroke text-ink-soft hover:text-ink'
            }`}
          >
            Order payment claims
          </button>
        </div>
      ) : null}

      {section === 'topups' ? (
        <Card title="Buyer wallet top-ups">
          <TopupAdmin hideHealth />
        </Card>
      ) : (
        <Card
          title="Order payment claims"
          action={
            claims.data ? (
              <Badge>{claims.data.isDemoMode ? 'Demo mode' : 'Live payments'}</Badge>
            ) : null
          }
        >
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CLAIM_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => updateParams({ section: 'claims', tab: item.id })}
                className={`inline-flex h-9 items-center rounded-pill px-3 text-xs font-medium transition ${
                  claimTab === item.id ? 'bg-rose text-white' : 'border border-stroke text-ink-soft hover:text-ink'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {claims.loading && !claims.data ? (
            <Skeleton className="h-48 w-full" />
          ) : claims.error ? (
            <ErrorState message={claims.error.message} onRetry={claims.refetch} />
          ) : (
            <DataTable
              caption="Order payment claims"
              columns={claimColumns}
              rows={claims.data?.rows ?? []}
              rowKey={(row) => row.orderId}
              emptyTitle="No payment claims match"
              emptyMessage="Order payment claims in this status will appear here."
            />
          )}
        </Card>
      )}

      <Modal
        open={overrideTarget !== null}
        title={overrideTarget ? `Override order #${overrideTarget.orderId.slice(0, 8).toUpperCase()}` : 'Override payment'}
        onClose={() => setOverrideTarget(null)}
      >
        {overrideTarget ? (
          <div className="space-y-4">
            <p className="text-xs text-ink-soft">
              {overrideTarget.productTitle} · {overrideTarget.amount} via {displayPaymentMethod(overrideTarget.method)}
            </p>
            <SelectField
              id="override-payment-action"
              label="Decision"
              value={overrideAction}
              options={[
                { value: 'verify', label: 'Mark payment verified' },
                { value: 'fail', label: 'Mark payment failed' },
              ]}
              onChange={(event) => setOverrideAction(event.target.value === 'fail' ? 'fail' : 'verify')}
            />
            <TextField
              id="override-payment-reason"
              label="Audit reason (min 10 chars)"
              placeholder="Confirmed transfer hash manually"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
            />
            {overrideFeedback ? (
              <p className="text-xs" style={{ color: 'var(--fault-ink)' }}>
                {overrideFeedback}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={overrideAction === 'fail' ? 'destructive' : 'primary'}
                loading={overrideBusy}
                disabled={overrideReason.trim().length < 10}
                onClick={() => void submitOverride()}
              >
                Confirm override
              </Button>
              <Button variant="ghost" onClick={() => setOverrideTarget(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
