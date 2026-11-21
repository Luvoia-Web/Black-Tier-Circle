'use client';

/**
 * Referral rewards, freebies, and points adjustment panel for Marketing.
 * Uses a live buyer username search picker (never a raw UUID input).
 */

import { useCallback, useEffect, useId, useState } from 'react';
import { Award, CheckCircle2, Clock, Search, UserCheck, Users, X } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  RelativeTime,
  SelectField,
  Skeleton,
  StatTile,
  StatusPill,
  SwitchField,
  TextAreaField,
  TextField,
  notify,
} from '@/components/platform/ui';
import { formatUsdtInput, usdtToMinor } from '@/lib/money';
import type { PeoplePayload, PersonRow } from '@/modules/platform/people';
import type { ReferralConfig } from '@/modules/store-config/types';

type Overview = {
  readonly settings: { readonly config: { readonly referrals: ReferralConfig }; readonly version: number };
  readonly totals: { readonly invited: number; readonly pending: number; readonly qualified: number; readonly rejected: number };
  readonly topReferrers: ReadonlyArray<{ readonly customerId: string; readonly name: string; readonly qualified: number }>;
};

type ReferralRow = {
  readonly id: string;
  readonly status: string;
  readonly referrerName: string;
  readonly referredName: string;
  readonly reason: string | null;
  readonly createdAt: string;
};

type FreebieRow = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: 'text' | 'link';
  readonly content: string;
  readonly requiredReferrals: number;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly claims: number;
};

type SettingsDraft = {
  readonly enabled: boolean;
  readonly freebiesEnabled: boolean;
  readonly redeemEnabled: boolean;
  readonly pointsPerReferral: string;
  readonly pointValue: string;
  readonly minRedeemPoints: string;
  readonly minOrder: string;
  readonly dailyRewardCap: string;
};

export function referralDraftFrom(config: ReferralConfig): SettingsDraft {
  return {
    enabled: config.enabled,
    freebiesEnabled: config.freebiesEnabled,
    redeemEnabled: config.redeemEnabled,
    pointsPerReferral: String(config.pointsPerReferral),
    pointValue: formatUsdtInput(BigInt(config.pointValueMinor)),
    minRedeemPoints: String(config.minRedeemPoints),
    minOrder: formatUsdtInput(BigInt(config.minQualifyingOrderMinor), { treatDustAsZero: true }),
    dailyRewardCap: String(config.dailyRewardCap),
  };
}

async function readJson<T>(response: Response): Promise<{ success: boolean; data?: T; error?: { message: string } }> {
  return (await response.json()) as { success: boolean; data?: T; error?: { message: string } };
}

function referralStatusLabel(status: string): { readonly label: string; readonly tone: 'warn' | 'ok' | 'fault' | 'neutral' } {
  if (status === 'qualified') return { label: 'Qualified', tone: 'ok' };
  if (status === 'rejected') return { label: 'Declined', tone: 'fault' };
  if (status === 'pending') return { label: 'Pending', tone: 'warn' };
  return { label: status.charAt(0).toUpperCase() + status.slice(1), tone: 'neutral' };
}

export function GrowthPanel({ base }: { readonly base: string }): JSX.Element {
  const summaryId = useId();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [freebies, setFreebies] = useState<FreebieRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [problems, setProblems] = useState<string[]>([]);
  const [rejectReason, setRejectReason] = useState('');

  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyerResults, setBuyerResults] = useState<readonly PersonRow[]>([]);
  const [buyerSearching, setBuyerSearching] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<PersonRow | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);

  const [freebie, setFreebie] = useState({
    title: '',
    kind: 'text' as 'text' | 'link',
    content: '',
    requiredReferrals: '2',
  });

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setProblems([]);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const [overviewResponse, referralResponse, freebieResponse] = await Promise.all([
        fetch(base, { signal: controller.signal }),
        fetch(`${base}/referrals?status=${status}&page=${page}&pageSize=20`, { signal: controller.signal }),
        fetch(`${base}/freebies`, { signal: controller.signal }),
      ]);
      const overviewJson = await readJson<Overview>(overviewResponse);
      const referralJson = await readJson<{ rows: ReferralRow[]; total: number }>(referralResponse);
      const freebieJson = await readJson<{ freebies: FreebieRow[] }>(freebieResponse);
      if (!overviewJson.success || !overviewJson.data || !referralJson.success || !referralJson.data || !freebieJson.success || !freebieJson.data) {
        setProblems([overviewJson.error?.message ?? referralJson.error?.message ?? freebieJson.error?.message ?? 'Unable to load referrals']);
        return;
      }
      setOverview(overviewJson.data);
      setDraft(referralDraftFrom(overviewJson.data.settings.config.referrals));
      setRows(referralJson.data.rows);
      setTotal(referralJson.data.total);
      setFreebies(freebieJson.data.freebies);
    } catch (cause: unknown) {
      const aborted = cause instanceof Error && cause.name === 'AbortError';
      setProblems([aborted ? 'This is taking too long. Try again.' : 'Unable to load referrals']);
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  }, [base, page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBuyerSearching(true);
      try {
        const res = await fetch(
          `/api/platform/people?type=buyer&q=${encodeURIComponent(buyerQuery.trim())}&page=1&pageSize=6`,
          { signal: controller.signal },
        );
        const json = await readJson<PeoplePayload>(res);
        if (json.success && json.data) {
          setBuyerResults(json.data.rows);
        }
      } catch {
        // Ignore aborted search requests.
      } finally {
        setBuyerSearching(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [buyerQuery]);

  async function saveSettings(): Promise<void> {
    if (!overview || !draft) return;
    setProblems([]);
    try {
      const referrals = {
        ...overview.settings.config.referrals,
        enabled: draft.enabled,
        freebiesEnabled: draft.freebiesEnabled,
        redeemEnabled: draft.redeemEnabled,
        pointsPerReferral: Number(draft.pointsPerReferral),
        pointValueMinor: usdtToMinor(draft.pointValue.trim() || '0').toString(),
        minRedeemPoints: Number(draft.minRedeemPoints),
        minQualifyingOrderMinor: usdtToMinor(draft.minOrder.trim() || '0').toString(),
        dailyRewardCap: Number(draft.dailyRewardCap),
      };
      const response = await fetch(base, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: referrals, version: overview.settings.version }),
      });
      const json = await readJson<{ version: number }>(response);
      if (!json.success) {
        setProblems([json.error?.message ?? 'Unable to save settings']);
        return;
      }
      notify({ message: 'Referral settings saved.' });
      await load();
    } catch (error: unknown) {
      setProblems([error instanceof Error ? error.message : 'Unable to save settings']);
    }
  }

  async function reject(id: string): Promise<void> {
    setProblems([]);
    const response = await fetch(`${base}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referralId: id, reason: rejectReason || 'Rejected from Marketing' }),
    });
    const json = await readJson<unknown>(response);
    if (!json.success) {
      setProblems([json.error?.message ?? 'Unable to decline that referral']);
      return;
    }
    notify({ message: 'Referral declined.' });
    await load();
  }

  async function submitAdjust(): Promise<void> {
    if (!selectedBuyer) return;
    setProblems([]);
    setAdjustBusy(true);
    try {
      const response = await fetch(`${base}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedBuyer.id,
          delta: Number(adjustDelta),
          reason: adjustReason.trim(),
          requestId: crypto.randomUUID(),
        }),
      });
      const json = await readJson<unknown>(response);
      if (!json.success) {
        setProblems([json.error?.message ?? 'Unable to adjust points']);
        return;
      }
      notify({ message: `Points updated for ${selectedBuyer.name}.` });
      setAdjustDelta('');
      setAdjustReason('');
      setSelectedBuyer(null);
    } finally {
      setAdjustBusy(false);
    }
  }

  async function addFreebie(): Promise<void> {
    setProblems([]);
    const response = await fetch(`${base}/freebies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: freebie.title,
        kind: freebie.kind,
        content: freebie.content,
        requiredReferrals: Number(freebie.requiredReferrals),
        description: '',
        active: true,
      }),
    });
    const json = await readJson<unknown>(response);
    if (!json.success) {
      setProblems([json.error?.message ?? 'Unable to add that freebie']);
      return;
    }
    setFreebie({ title: '', kind: 'text', content: '', requiredReferrals: '2' });
    notify({ message: 'Freebie added.' });
    await load();
  }

  async function patchFreebie(id: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${base}/freebies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await readJson<unknown>(response);
    if (!json.success) {
      setProblems([json.error?.message ?? 'Unable to update that freebie']);
      return;
    }
    await load();
  }

  const pages = Math.max(1, Math.ceil(total / 20));
  const deltaNumber = Number(adjustDelta);
  const canSubmitAdjust =
    selectedBuyer !== null &&
    Number.isInteger(deltaNumber) &&
    deltaNumber !== 0 &&
    adjustReason.trim().length > 0 &&
    !adjustBusy;

  if (loading && !overview) {
    return (
      <div className="space-y-4" aria-label="Loading referral program">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="glass-card rounded-lg p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {problems.length > 0 ? (
        <div id={summaryId} role="alert" tabIndex={-1}>
          <ErrorState message={problems.join(' ')} onRetry={() => void load()} />
        </div>
      ) : null}

      {overview ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <StatTile label="Invited" value={String(overview.totals.invited)} icon={Users} tone="rose" />
          <StatTile label="Pending review" value={String(overview.totals.pending)} icon={Clock} tone="amber" />
          <StatTile label="Qualified" value={String(overview.totals.qualified)} icon={CheckCircle2} tone="mint" />
          <StatTile label="Declined" value={String(overview.totals.rejected)} icon={Award} tone="sky" />
        </div>
      ) : null}

      {overview && draft ? (
        <Card title="Referral & reward rules">
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <SwitchField id="ref-enabled" label="Referrals enabled" checked={draft.enabled} onChange={(checked) => setDraft({ ...draft, enabled: checked })} />
              <SwitchField id="ref-freebies" label="Freebies enabled" checked={draft.freebiesEnabled} onChange={(checked) => setDraft({ ...draft, freebiesEnabled: checked })} />
              <SwitchField id="ref-redeem" label="Point redemption enabled" checked={draft.redeemEnabled} onChange={(checked) => setDraft({ ...draft, redeemEnabled: checked })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextField
                id="ref-points-per"
                label="Points per referral"
                inputMode="numeric"
                value={draft.pointsPerReferral}
                onChange={(event) => setDraft({ ...draft, pointsPerReferral: event.target.value })}
              />
              <TextField
                id="ref-point-value"
                label="USDT per point"
                inputMode="decimal"
                value={draft.pointValue}
                onChange={(event) => setDraft({ ...draft, pointValue: event.target.value })}
              />
              <TextField
                id="ref-min-redeem"
                label="Minimum points to redeem"
                inputMode="numeric"
                value={draft.minRedeemPoints}
                onChange={(event) => setDraft({ ...draft, minRedeemPoints: event.target.value })}
              />
              <TextField
                id="ref-min-order"
                label="Minimum qualifying order (USDT)"
                hint="Use 0 for any paid order"
                inputMode="decimal"
                value={draft.minOrder}
                onChange={(event) => setDraft({ ...draft, minOrder: event.target.value })}
              />
              <TextField
                id="ref-daily-cap"
                label="Daily reward cap"
                inputMode="numeric"
                value={draft.dailyRewardCap}
                onChange={(event) => setDraft({ ...draft, dailyRewardCap: event.target.value })}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button onClick={() => void saveSettings()}>Save settings</Button>
              {overview.topReferrers.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <span>Top referrers:</span>
                  {overview.topReferrers.slice(0, 4).map((person) => (
                    <span key={person.customerId} className="rounded-pill border border-stroke px-2.5 py-0.5 text-ink">
                      {person.name} · <span className="font-num text-ink-soft">{person.qualified}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-faint">No qualified referrers yet.</p>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Adjust points">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitAdjust();
            }}
          >
            <div>
              <label htmlFor="adjust-buyer-search" className="mb-1 block text-sm text-ink">
                Buyer (@username or name)
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
                <input
                  id="adjust-buyer-search"
                  type="search"
                  value={buyerQuery}
                  placeholder="Search by @username or buyer name..."
                  className="min-h-11 w-full rounded-md border border-stroke bg-raised pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint"
                  onChange={(event) => setBuyerQuery(event.target.value)}
                />
              </div>
              {selectedBuyer ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose/35 bg-rose/10 px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-ink">
                    <UserCheck className="h-3.5 w-3.5 text-rose" aria-hidden="true" />
                    Selected: <strong>{selectedBuyer.name}</strong> · {selectedBuyer.balance}
                  </span>
                  <button
                    type="button"
                    aria-label="Clear buyer"
                    className="inline-flex items-center gap-1 text-ink-soft hover:text-ink"
                    onClick={() => setSelectedBuyer(null)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
                  </button>
                </div>
              ) : (
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-stroke/60 bg-black/20 p-1.5">
                  {buyerSearching && buyerResults.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-ink-faint">Searching buyers...</p>
                  ) : buyerResults.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-ink-faint">No matching buyers found.</p>
                  ) : (
                    buyerResults.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition hover:bg-white/[0.06]"
                        onClick={() => setSelectedBuyer(person)}
                      >
                        <span className="min-w-0 truncate font-medium text-ink">{person.name}</span>
                        <span className="shrink-0 font-num text-ink-faint">
                          {person.balance} · {person.orders} orders
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id="adjust-delta"
                label="Points to add or subtract"
                placeholder="e.g. 5 or -2"
                inputMode="numeric"
                value={adjustDelta}
                onChange={(event) => setAdjustDelta(event.target.value)}
              />
              <TextField
                id="adjust-reason"
                label="Reason"
                placeholder="Goodwill reward"
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
              />
            </div>

            <Button type="submit" loading={adjustBusy} disabled={!canSubmitAdjust}>
              Update points
            </Button>
          </form>
        </Card>

        <Card title="Freebies">
          <div className="space-y-4">
            {freebies.length === 0 ? (
              <EmptyState title="No freebies yet" message="Add a freebie reward unlocked after referrals." />
            ) : (
              <ul className="space-y-2">
                {freebies.map((item, index) => (
                  <li key={item.id} className="rounded-lg border border-stroke/70 bg-black/20 p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{item.title}</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {item.requiredReferrals} referrals · {item.claims} claims · {item.kind === 'link' ? 'Link reward' : 'Text reward'}
                        </p>
                      </div>
                      <StatusPill tone={item.active ? 'ok' : 'neutral'}>{item.active ? 'Active' : 'Inactive'}</StatusPill>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => void patchFreebie(item.id, { active: !item.active })}>
                        {item.active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button variant="secondary" disabled={index === 0} onClick={() => void patchFreebie(item.id, { sortOrder: Math.max(0, item.sortOrder - 1) })}>
                        Move up
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2.5 border-t border-stroke/60 pt-3">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <TextField
                  id="freebie-title"
                  label="Freebie title"
                  value={freebie.title}
                  onChange={(event) => setFreebie({ ...freebie, title: event.target.value })}
                />
                <SelectField
                  id="freebie-kind"
                  label="Reward type"
                  value={freebie.kind}
                  options={[
                    { value: 'text', label: 'Text message' },
                    { value: 'link', label: 'Link' },
                  ]}
                  onChange={(event) => setFreebie({ ...freebie, kind: event.target.value === 'link' ? 'link' : 'text' })}
                />
              </div>
              <TextAreaField
                id="freebie-content"
                label="Reward content"
                value={freebie.content}
                onChange={(event) => setFreebie({ ...freebie, content: event.target.value })}
              />
              <TextField
                id="freebie-referrals"
                label="Referrals required (0 = everyone)"
                inputMode="numeric"
                value={freebie.requiredReferrals}
                onChange={(event) => setFreebie({ ...freebie, requiredReferrals: event.target.value })}
              />
              <Button disabled={freebie.title.trim().length === 0 || freebie.content.trim().length === 0} onClick={() => void addFreebie()}>
                Add freebie
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Referrals">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <SelectField
              id="referral-status-filter"
              label="Status"
              value={status}
              options={[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'qualified', label: 'Qualified' },
                { value: 'rejected', label: 'Declined' },
              ]}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
            />
            <TextField
              id="referral-reject-reason"
              label="Decline reason"
              placeholder="Optional note when declining a pending referral"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState title="No referrals on this page" message="Invited buyers appear here once referrals start coming in." />
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => {
                const pill = referralStatusLabel(row.status);
                return (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stroke/70 bg-black/20 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="text-ink">
                        {row.referrerName} invited <strong>{row.referredName}</strong>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        <RelativeTime value={row.createdAt} />
                        {row.reason ? ` · ${row.reason}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                      {row.status === 'pending' ? (
                        <Button variant="secondary" onClick={() => void reject(row.id)}>
                          Decline
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 text-xs text-ink-faint">
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Previous
              </Button>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>
                Next
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
