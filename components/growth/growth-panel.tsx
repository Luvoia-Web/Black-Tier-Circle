'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { minorToUsdt, usdtToMinor } from '@/lib/money';
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

function draftFrom(config: ReferralConfig): SettingsDraft {
  return {
    enabled: config.enabled,
    freebiesEnabled: config.freebiesEnabled,
    redeemEnabled: config.redeemEnabled,
    pointsPerReferral: String(config.pointsPerReferral),
    pointValue: minorToUsdt(BigInt(config.pointValueMinor)).replace(/0+$/, '').replace(/\.$/, ''),
    minRedeemPoints: String(config.minRedeemPoints),
    minOrder: minorToUsdt(BigInt(config.minQualifyingOrderMinor)).replace(/0+$/, '').replace(/\.$/, ''),
    dailyRewardCap: String(config.dailyRewardCap),
  };
}

async function readJson<T>(response: Response): Promise<{ success: boolean; data?: T; error?: { message: string } }> {
  return (await response.json()) as { success: boolean; data?: T; error?: { message: string } };
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
  const [saved, setSaved] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [adjust, setAdjust] = useState({ customerId: '', delta: '', reason: '' });
  const [freebie, setFreebie] = useState({ title: '', kind: 'text' as 'text' | 'link', content: '', requiredReferrals: '2' });

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setProblems([]);
    try {
      const [overviewResponse, referralResponse, freebieResponse] = await Promise.all([
        fetch(base),
        fetch(`${base}/referrals?status=${status}&page=${page}&pageSize=20`),
        fetch(`${base}/freebies`),
      ]);
      const overviewJson = await readJson<Overview>(overviewResponse);
      const referralJson = await readJson<{ rows: ReferralRow[]; total: number }>(referralResponse);
      const freebieJson = await readJson<{ freebies: FreebieRow[] }>(freebieResponse);
      if (!overviewJson.success || !overviewJson.data || !referralJson.success || !referralJson.data || !freebieJson.success || !freebieJson.data) {
        setProblems([overviewJson.error?.message ?? referralJson.error?.message ?? freebieJson.error?.message ?? 'Unable to load growth']);
        return;
      }
      setOverview(overviewJson.data);
      setDraft(draftFrom(overviewJson.data.settings.config.referrals));
      setRows(referralJson.data.rows);
      setTotal(referralJson.data.total);
      setFreebies(freebieJson.data.freebies);
    } catch {
      setProblems(['Unable to load growth']);
    } finally {
      setLoading(false);
    }
  }, [base, page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings(): Promise<void> {
    if (!overview || !draft) {
      return;
    }
    setSaved('');
    setProblems([]);
    try {
      const referrals = {
        ...overview.settings.config.referrals,
        enabled: draft.enabled,
        freebiesEnabled: draft.freebiesEnabled,
        redeemEnabled: draft.redeemEnabled,
        pointsPerReferral: Number(draft.pointsPerReferral),
        pointValueMinor: usdtToMinor(draft.pointValue || '0').toString(),
        minRedeemPoints: Number(draft.minRedeemPoints),
        minQualifyingOrderMinor: usdtToMinor(draft.minOrder || '0').toString(),
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
      setSaved('Settings saved.');
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
      body: JSON.stringify({ referralId: id, reason: rejectReason }),
    });
    const json = await readJson<unknown>(response);
    if (!json.success) {
      setProblems([json.error?.message ?? 'Unable to reject that referral']);
      return;
    }
    setSaved('Referral rejected.');
    await load();
  }

  async function submitAdjust(): Promise<void> {
    setProblems([]);
    const response = await fetch(`${base}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: adjust.customerId.trim(),
        delta: Number(adjust.delta),
        reason: adjust.reason,
        requestId: crypto.randomUUID(),
      }),
    });
    const json = await readJson<unknown>(response);
    if (!json.success) {
      setProblems([json.error?.message ?? 'Unable to adjust points']);
      return;
    }
    setSaved('Points updated.');
    setAdjust({ customerId: '', delta: '', reason: '' });
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
    setSaved('Freebie added.');
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

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Growth" description="Referrals, points, and freebies for this store." />
      {loading ? <p className="text-sm text-[var(--text-2)]">Loading…</p> : null}
      {problems.length > 0 ? (
        <div id={summaryId} role="alert" className="mb-4 rounded-md border border-[var(--red)] p-3" tabIndex={-1}>
          <ul className="list-disc pl-5 text-sm text-[var(--red)]">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {saved ? (
        <p className="mb-4 text-sm text-[var(--green)]" role="status">
          {saved}
        </p>
      ) : null}
      {overview && draft ? (
        <section className="btc-card mb-6 p-4">
          <h2 className="text-base font-semibold text-[var(--text-1)]">Settings</h2>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            Invited {overview.totals.invited}, pending {overview.totals.pending}, qualified {overview.totals.qualified}, rejected {overview.totals.rejected}.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-2)]">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
              Referrals on
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-2)]">
              <input type="checkbox" checked={draft.freebiesEnabled} onChange={(event) => setDraft({ ...draft, freebiesEnabled: event.target.checked })} />
              Freebies on
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-2)]">
              <input type="checkbox" checked={draft.redeemEnabled} onChange={(event) => setDraft({ ...draft, redeemEnabled: event.target.checked })} />
              Redeem on
            </label>
            <label className="text-sm text-[var(--text-2)]">
              Points per referral
              <input className="btc-input mt-1 min-h-11" inputMode="numeric" value={draft.pointsPerReferral} onChange={(event) => setDraft({ ...draft, pointsPerReferral: event.target.value })} />
            </label>
            <label className="text-sm text-[var(--text-2)]">
              USDT per point
              <input className="btc-input mt-1 min-h-11" inputMode="decimal" value={draft.pointValue} onChange={(event) => setDraft({ ...draft, pointValue: event.target.value })} />
            </label>
            <label className="text-sm text-[var(--text-2)]">
              Minimum points to redeem
              <input className="btc-input mt-1 min-h-11" inputMode="numeric" value={draft.minRedeemPoints} onChange={(event) => setDraft({ ...draft, minRedeemPoints: event.target.value })} />
            </label>
            <label className="text-sm text-[var(--text-2)]">
              Minimum order (USDT, 0 = any paid order)
              <input className="btc-input mt-1 min-h-11" inputMode="decimal" value={draft.minOrder} onChange={(event) => setDraft({ ...draft, minOrder: event.target.value })} />
            </label>
            <label className="text-sm text-[var(--text-2)]">
              Daily reward cap
              <input className="btc-input mt-1 min-h-11" inputMode="numeric" value={draft.dailyRewardCap} onChange={(event) => setDraft({ ...draft, dailyRewardCap: event.target.value })} />
            </label>
          </div>
          <button type="button" className="btc-btn-primary mt-3 min-h-11" onClick={() => void saveSettings()}>
            Save settings
          </button>
          {overview.topReferrers.length > 0 ? (
            <ul className="mt-4 text-sm text-[var(--text-2)]">
              {overview.topReferrers.map((person) => (
                <li key={person.customerId}>
                  {person.name}: {person.qualified} qualified
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-[var(--text-3)]">No qualified referrers yet.</p>
          )}
        </section>
      ) : null}
      <section className="btc-card mb-6 p-4">
        <h2 className="text-base font-semibold text-[var(--text-1)]">Referrals</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="text-sm text-[var(--text-2)]">
            Status
            <select className="btc-input mt-1 min-h-11" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="qualified">Qualified</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="text-sm text-[var(--text-2)] sm:flex-1">
            Reject reason
            <input className="btc-input mt-1 min-h-11" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
          </label>
        </div>
        {rows.length === 0 ? <p className="mt-3 text-sm text-[var(--text-3)]">No referrals on this page.</p> : null}
        <ul className="mt-3 grid gap-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-md border border-[var(--border)] p-3 text-sm text-[var(--text-2)]">
              <p>
                {row.referrerName} invited {row.referredName} — {row.status}
              </p>
              {row.status === 'pending' ? (
                <button type="button" className="btc-btn-secondary mt-2 min-h-11" onClick={() => void reject(row.id)}>
                  Reject
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <button type="button" className="btc-btn-secondary min-h-11" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Previous
          </button>
          <button type="button" className="btc-btn-secondary min-h-11" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>
            Next
          </button>
        </div>
      </section>
      <section className="btc-card mb-6 p-4">
        <h2 className="text-base font-semibold text-[var(--text-1)]">Adjust points</h2>
        <div className="mt-3 grid gap-2">
          <label className="text-sm text-[var(--text-2)]">
            Customer id
            <input className="btc-input mt-1 min-h-11" value={adjust.customerId} onChange={(event) => setAdjust({ ...adjust, customerId: event.target.value })} />
          </label>
          <label className="text-sm text-[var(--text-2)]">
            Points to add or remove
            <input className="btc-input mt-1 min-h-11" inputMode="numeric" value={adjust.delta} onChange={(event) => setAdjust({ ...adjust, delta: event.target.value })} />
          </label>
          <label className="text-sm text-[var(--text-2)]">
            Reason
            <input className="btc-input mt-1 min-h-11" value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} />
          </label>
          <button type="button" className="btc-btn-primary min-h-11" onClick={() => void submitAdjust()}>
            Update points
          </button>
        </div>
      </section>
      <section className="btc-card p-4">
        <h2 className="text-base font-semibold text-[var(--text-1)]">Freebies</h2>
        {freebies.length === 0 ? <p className="mt-3 text-sm text-[var(--text-3)]">No freebies yet.</p> : null}
        <ul className="mt-3 grid gap-2">
          {freebies.map((item, index) => (
            <li key={item.id} className="rounded-md border border-[var(--border)] p-3 text-sm text-[var(--text-2)]">
              <p>
                {item.title} — {item.requiredReferrals} referrals — {item.claims} claims — {item.active ? 'active' : 'inactive'}
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btc-btn-secondary min-h-11" onClick={() => void patchFreebie(item.id, { active: !item.active })}>
                  {item.active ? 'Deactivate' : 'Activate'}
                </button>
                <button type="button" className="btc-btn-secondary min-h-11" disabled={index === 0} onClick={() => void patchFreebie(item.id, { sortOrder: Math.max(0, item.sortOrder - 1) })}>
                  Move up
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2">
          <label className="text-sm text-[var(--text-2)]">
            Title
            <input className="btc-input mt-1 min-h-11" value={freebie.title} onChange={(event) => setFreebie({ ...freebie, title: event.target.value })} />
          </label>
          <label className="text-sm text-[var(--text-2)]">
            Kind
            <select className="btc-input mt-1 min-h-11" value={freebie.kind} onChange={(event) => setFreebie({ ...freebie, kind: event.target.value === 'link' ? 'link' : 'text' })}>
              <option value="text">Text</option>
              <option value="link">Link</option>
            </select>
          </label>
          <label className="text-sm text-[var(--text-2)]">
            Content
            <textarea className="btc-input mt-1 min-h-24" value={freebie.content} onChange={(event) => setFreebie({ ...freebie, content: event.target.value })} />
          </label>
          <label className="text-sm text-[var(--text-2)]">
            Referrals required (0 = everyone)
            <input className="btc-input mt-1 min-h-11" inputMode="numeric" value={freebie.requiredReferrals} onChange={(event) => setFreebie({ ...freebie, requiredReferrals: event.target.value })} />
          </label>
          <button type="button" className="btc-btn-primary min-h-11" onClick={() => void addFreebie()}>
            Add freebie
          </button>
        </div>
      </section>
    </div>
  );
}
