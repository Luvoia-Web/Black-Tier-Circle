'use client';

/**
 * Discounts page. Plain-English promo code management; checkout redemption runs
 * strictly through the redeem_discount_code database function.
 */

import { type FormEvent, useState } from 'react';
import { CheckCircle2, Percent, Tag, Ticket } from 'lucide-react';
import type { DiscountCodeRow, GrowthPayload } from '@/components/growth/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  RelativeTime,
  Skeleton,
  StatTile,
  StatusPill,
  TextField,
  notify,
} from '@/components/platform/ui';
import { displayDiscountValue } from '@/lib/display-labels';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { formatUsdt, minorToUsdt, usdtToMinor } from '@/lib/money';

function formatMinimum(minorStr: string): string {
  try {
    const val = BigInt(minorStr || '0');
    return val > 0n ? `Min order ${formatUsdt(val)}` : 'No minimum order';
  } catch {
    return 'No minimum order';
  }
}

function editValueFromRow(row: DiscountCodeRow): string {
  if (row.kind === 'percent') return row.value;
  try {
    return minorToUsdt(BigInt(row.value)).replace(/0+$/, '').replace(/\.$/, '');
  } catch {
    return row.value;
  }
}

function editMinFromRow(row: DiscountCodeRow): string {
  try {
    const val = BigInt(row.minOrderMinor || '0');
    if (val <= 0n) return '0';
    return minorToUsdt(val).replace(/0+$/, '').replace(/\.$/, '');
  } catch {
    return '0';
  }
}

export function DiscountsView(): JSX.Element {
  const growth = useData<GrowthPayload>('/api/platform/growth');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [valueInput, setValueInput] = useState('');
  const [minOrderUsdt, setMinOrderUsdt] = useState('0');
  const [maxUses, setMaxUses] = useState('');
  const [perCustomerLimit, setPerCustomerLimit] = useState('1');
  const [expiresDate, setExpiresDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const codes = growth.data?.codes ?? [];
  const activeCount = codes.filter((item) => item.active).length;
  const totalUses = codes.reduce((sum, item) => sum + item.usedCount, 0);

  function resetForm(): void {
    setEditingId(null);
    setCode('');
    setKind('percent');
    setValueInput('');
    setMinOrderUsdt('0');
    setMaxUses('');
    setPerCustomerLimit('1');
    setExpiresDate('');
    setFormError(null);
  }

  function startEdit(row: DiscountCodeRow): void {
    setEditingId(row.id);
    setCode(row.code);
    setKind(row.kind);
    setValueInput(editValueFromRow(row));
    setMinOrderUsdt(editMinFromRow(row));
    setMaxUses(row.maxUses === null ? '' : String(row.maxUses));
    setPerCustomerLimit(row.perCustomerLimit === null ? '' : String(row.perCustomerLimit));
    setExpiresDate(row.expiresAt ? row.expiresAt.slice(0, 10) : '');
    setFormError(null);
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);

    let serverValue = valueInput.trim();
    if (kind === 'percent') {
      const pct = Number(serverValue);
      if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
        setFormError('Enter a whole percentage between 1 and 100.');
        return;
      }
      serverValue = String(pct);
    } else {
      try {
        const minorVal = usdtToMinor(serverValue);
        if (minorVal <= 0n) {
          setFormError('Fixed amount must be above zero.');
          return;
        }
        serverValue = minorVal.toString();
      } catch {
        setFormError('Enter a valid USDT amount (for example 2.50).');
        return;
      }
    }

    let minOrderMinor = '0';
    if (minOrderUsdt.trim() && minOrderUsdt.trim() !== '0') {
      try {
        minOrderMinor = usdtToMinor(minOrderUsdt.trim()).toString();
      } catch {
        setFormError('Enter a valid minimum order amount in USDT (for example 5.00).');
        return;
      }
    }

    const parsedMaxUses = maxUses.trim() ? Number(maxUses.trim()) : null;
    if (parsedMaxUses !== null && (!Number.isInteger(parsedMaxUses) || parsedMaxUses < 1)) {
      setFormError('Maximum total uses must be a whole number above zero, or left blank.');
      return;
    }
    const parsedPerBuyer = perCustomerLimit.trim() ? Number(perCustomerLimit.trim()) : null;
    if (parsedPerBuyer !== null && (!Number.isInteger(parsedPerBuyer) || parsedPerBuyer < 1)) {
      setFormError('Uses per buyer must be a whole number above zero, or left blank.');
      return;
    }

    setSaving(true);
    const result = await runAction('/api/platform/growth', {
      method: 'POST',
      body: {
        action: editingId ? 'update_code' : 'code',
        ...(editingId ? { id: editingId } : {}),
        code: code.trim().toUpperCase(),
        kind,
        value: serverValue,
        minOrderMinor,
        maxUses: parsedMaxUses,
        perCustomerLimit: parsedPerBuyer,
        expiresAt: expiresDate.trim() ? `${expiresDate.trim()}T23:59:59.000Z` : '',
      },
    });
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    notify({ message: editingId ? 'Discount code updated.' : 'Discount code added.' });
    resetForm();
    growth.refetch();
  }

  async function toggleActive(row: DiscountCodeRow): Promise<void> {
    const result = await runAction('/api/platform/growth', {
      method: 'POST',
      body: { action: 'active', id: row.id, active: !row.active },
    });
    if (!result.ok) {
      notify({ message: result.error.message, tone: 'fault' });
      return;
    }
    notify({ message: row.active ? `${row.code} turned off.` : `${row.code} turned on.` });
    growth.refetch();
  }

  async function removeCode(row: DiscountCodeRow): Promise<void> {
    const result = await runAction('/api/platform/growth', {
      method: 'POST',
      body: { action: 'delete_code', id: row.id },
    });
    if (!result.ok) {
      notify({ message: result.error.message, tone: 'fault' });
      return;
    }
    if (editingId === row.id) resetForm();
    notify({ message: `Deleted ${row.code}.` });
    growth.refetch();
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-[30px] font-medium tracking-tight text-ink">Discounts</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Promo codes buyers enter at checkout inside your Telegram bot.
        </p>
      </header>

      {growth.loading && !growth.data ? (
        <div className="space-y-4" aria-label="Loading discount codes">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="glass-card rounded-lg p-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
          <Skeleton className="h-52 w-full" />
        </div>
      ) : null}

      {growth.error && !growth.data ? (
        <ErrorState
          message={growth.error.message}
          requestId={growth.error.requestId}
          detail={growth.error.detail}
          onRetry={growth.refetch}
        />
      ) : null}

      {growth.data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            <StatTile label="Total codes" value={String(codes.length)} icon={Tag} tone="rose" />
            <StatTile label="Active codes" value={String(activeCount)} icon={CheckCircle2} tone="mint" />
            <StatTile label="Total redemptions" value={String(totalUses)} icon={Ticket} tone="sky" />
          </div>

          {growth.data.needsMigration ? (
            <Card title="Migration needed">
              <p className="text-sm text-ink-soft">Discount codes require migration 0032 to be applied.</p>
            </Card>
          ) : null}

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
            <Card
              title={editingId ? `Edit ${code || 'code'}` : 'Create discount code'}
              action={<Percent className="h-4 w-4 text-rose" aria-hidden="true" />}
            >
              <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
                <TextField
                  id="discount-code"
                  label="Promo code"
                  placeholder="WELCOME10"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                />

                <div>
                  <p className="mb-1 text-sm text-ink">Discount type</p>
                  <div className="inline-flex w-full rounded-xl border border-stroke bg-black/25 p-1" role="tablist" aria-label="Discount type">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={kind === 'percent'}
                      className={`h-9 flex-1 rounded-lg text-xs transition ${
                        kind === 'percent' ? 'bg-white/12 text-ink' : 'text-ink-faint hover:text-ink-soft'
                      }`}
                      onClick={() => setKind('percent')}
                    >
                      Percentage (%)
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={kind === 'fixed'}
                      className={`h-9 flex-1 rounded-lg text-xs transition ${
                        kind === 'fixed' ? 'bg-white/12 text-ink' : 'text-ink-faint hover:text-ink-soft'
                      }`}
                      onClick={() => setKind('fixed')}
                    >
                      Fixed amount (USDT)
                    </button>
                  </div>
                </div>

                <TextField
                  id="discount-value"
                  label={kind === 'percent' ? 'Percent off (1–100)' : 'Amount off (USDT)'}
                  placeholder={kind === 'percent' ? '20' : '2.00'}
                  inputMode={kind === 'percent' ? 'numeric' : 'decimal'}
                  value={valueInput}
                  onChange={(event) => setValueInput(event.target.value)}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="discount-min-order"
                    label="Minimum order (USDT)"
                    hint="0 for no minimum"
                    inputMode="decimal"
                    value={minOrderUsdt}
                    onChange={(event) => setMinOrderUsdt(event.target.value)}
                  />
                  <TextField
                    id="discount-per-buyer"
                    label="Uses per buyer"
                    placeholder="1"
                    inputMode="numeric"
                    value={perCustomerLimit}
                    onChange={(event) => setPerCustomerLimit(event.target.value)}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="discount-max-uses"
                    label="Maximum total uses"
                    placeholder="Unlimited"
                    inputMode="numeric"
                    value={maxUses}
                    onChange={(event) => setMaxUses(event.target.value)}
                  />
                  <TextField
                    id="discount-expires"
                    label="Expires on"
                    type="date"
                    value={expiresDate}
                    onChange={(event) => setExpiresDate(event.target.value)}
                  />
                </div>

                {formError ? (
                  <p className="text-xs" style={{ color: 'var(--fault-ink)' }}>
                    {formError}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" loading={saving} disabled={code.trim().length < 3 || valueInput.trim().length === 0}>
                    {editingId ? 'Update code' : 'Save code'}
                  </Button>
                  {editingId ? (
                    <Button variant="secondary" onClick={resetForm}>
                      Cancel edit
                    </Button>
                  ) : null}
                </div>
              </form>
            </Card>

            <Card title="Promo codes">
              {codes.length === 0 ? (
                <EmptyState
                  title="No promo codes yet"
                  message="Create a percentage or fixed USDT discount code. Buyers redeem it inside checkout and pricing respects your cost floor."
                />
              ) : (
                <ul className="space-y-2.5">
                  {codes.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stroke/70 bg-black/20 px-3.5 py-3 text-sm"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 font-mono text-xs font-semibold text-ink">
                            {row.code}
                          </span>
                          <span className="font-num text-sm font-medium text-ink">
                            {displayDiscountValue(row.kind, row.value)}
                          </span>
                          <StatusPill tone={row.active ? 'ok' : 'neutral'}>{row.active ? 'Active' : 'Off'}</StatusPill>
                        </div>
                        <p className="text-xs text-ink-soft">
                          {formatMinimum(row.minOrderMinor)} ·{' '}
                          <span className="font-num">
                            {row.usedCount}
                            {row.maxUses ? ` / ${row.maxUses}` : ''} used
                          </span>
                          {row.perCustomerLimit ? ` · ${row.perCustomerLimit} per buyer` : ''}
                          {row.expiresAt ? (
                            <>
                              {' '}
                              · Expires <RelativeTime value={row.expiresAt} />
                            </>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => startEdit(row)}>
                          Edit code
                        </Button>
                        <Button variant="secondary" onClick={() => void toggleActive(row)}>
                          {row.active ? 'Turn off' : 'Turn on'}
                        </Button>
                        <Button variant="destructive" onClick={() => void removeCode(row)}>
                          Delete
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </section>
  );
}
