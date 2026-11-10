'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { PreviewHtml } from '@/components/bot-studio/preview-html';
import { formatUsdt, minorToUsdt, usdtToMinor } from '@/lib/money';
import { bulkOfferText } from '@/modules/catalog/shop-screen';
import {
  percentToHundredths,
  unitPriceFromPercentOff,
  validateTiers,
  type BulkTier,
} from '@/modules/pricing/tiers';

type TierRow = {
  readonly minQty: string;
  readonly unitPrice: string;
  readonly percent: string;
};

type TierPayload = {
  readonly tiers: ReadonlyArray<{ readonly id: string; readonly minQty: number; readonly unitPriceMinor: string }>;
  readonly floorMinor: string | null;
  readonly floorKnown: boolean;
  readonly baseUnitMinor: string;
  readonly note: string;
};

const EMPTY_ROW: TierRow = { minQty: '', unitPrice: '', percent: '' };

function trimUsdt(minor: bigint): string {
  return minorToUsdt(minor).replace(/0+$/, '').replace(/\.$/, '');
}

function parseRows(rows: readonly TierRow[]): { tiers: BulkTier[]; problems: string[] } {
  const tiers: BulkTier[] = [];
  const problems: string[] = [];
  rows.forEach((row, index) => {
    const blank = row.minQty.trim() === '' && row.unitPrice.trim() === '';
    if (blank) {
      return;
    }
    const qty = Number(row.minQty);
    if (!Number.isInteger(qty) || qty < 2) {
      problems.push(`Row ${index + 1}: minimum quantity must be a whole number of at least 2.`);
    }
    try {
      const price = usdtToMinor(row.unitPrice || '0');
      if (Number.isInteger(qty) && qty >= 2) {
        tiers.push({ minQty: qty, unitPriceMinor: price });
      }
    } catch {
      problems.push(`Row ${index + 1}: enter a USDT price with at most 6 decimal places.`);
    }
  });
  return { tiers, problems };
}

/**
 * Up to five bulk tiers. Percent off is integer math rounded down to the minor unit.
 */
export function BulkTierEditor({
  endpoint,
  productTitle,
}: {
  readonly endpoint: string;
  readonly productTitle: string;
}): JSX.Element {
  const summaryId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<TierRow[]>([EMPTY_ROW]);
  const [baseUnit, setBaseUnit] = useState<bigint | null>(null);
  const [floor, setFloor] = useState<bigint | null>(null);
  const [floorKnown, setFloorKnown] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(endpoint);
        const json = (await response.json()) as { success: boolean; data?: TierPayload; error?: { message: string } };
        if (cancelled) {
          return;
        }
        if (!json.success || !json.data) {
          setLoadError(json.error?.message ?? 'Unable to load bulk tiers');
          return;
        }
        setBaseUnit(BigInt(json.data.baseUnitMinor));
        setFloor(json.data.floorMinor === null ? null : BigInt(json.data.floorMinor));
        setFloorKnown(json.data.floorKnown);
        setNote(json.data.note);
        setRows(
          json.data.tiers.length > 0
            ? json.data.tiers.map((tier) => ({
                minQty: String(tier.minQty),
                unitPrice: trimUsdt(BigInt(tier.unitPriceMinor)),
                percent: '',
              }))
            : [EMPTY_ROW],
        );
      } catch {
        if (!cancelled) {
          setLoadError('Unable to load bulk tiers');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const parsed = parseRows(rows);
  let liveError = parsed.problems[0] ?? '';
  let preview = '';
  if (!liveError && baseUnit !== null && parsed.tiers.length > 0) {
    try {
      validateTiers(baseUnit, floorKnown ? floor : null, parsed.tiers);
      preview = bulkOfferText({
        baseUnit,
        tiers: parsed.tiers,
        floorMinor: floorKnown ? floor : null,
        heading: 'card',
      });
    } catch (error: unknown) {
      liveError = error instanceof Error ? error.message : 'Check the tiers.';
    }
  }

  function patch(index: number, next: Partial<TierRow>): void {
    setSaved(false);
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row)));
  }

  function applyPercent(index: number): void {
    if (baseUnit === null) {
      return;
    }
    try {
      const hundredths = percentToHundredths(rows[index]?.percent ?? '');
      const price = unitPriceFromPercentOff(baseUnit, hundredths);
      patch(index, { unitPrice: trimUsdt(price) });
      setProblems([]);
    } catch (error: unknown) {
      setProblems([error instanceof Error ? error.message : 'Enter a percent off.']);
      summaryRef.current?.focus();
    }
  }

  async function save(): Promise<void> {
    setSaved(false);
    const next = parseRows(rows);
    if (next.problems.length > 0 || baseUnit === null) {
      setProblems(next.problems.length > 0 ? next.problems : ['The regular price is not loaded yet.']);
      summaryRef.current?.focus();
      return;
    }
    try {
      validateTiers(baseUnit, floorKnown ? floor : null, next.tiers);
    } catch (error: unknown) {
      setProblems([error instanceof Error ? error.message : 'Check the tiers.']);
      summaryRef.current?.focus();
      return;
    }
    setSaving(true);
    setProblems([]);
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiers: next.tiers.map((tier) => ({
            minQty: tier.minQty,
            unitPrice: minorToUsdt(tier.unitPriceMinor),
          })),
        }),
      });
      const json = (await response.json()) as { success: boolean; data?: TierPayload; error?: { message: string } };
      if (!json.success || !json.data) {
        setProblems([json.error?.message ?? 'Unable to save tiers']);
        summaryRef.current?.focus();
        return;
      }
      setFloor(json.data.floorMinor === null ? null : BigInt(json.data.floorMinor));
      setFloorKnown(json.data.floorKnown);
      setNote(json.data.note);
      setSaved(true);
    } catch {
      setProblems(['Unable to save tiers']);
      summaryRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4" aria-labelledby={`${summaryId}-title`}>
      <h2 id={`${summaryId}-title`} className="text-base font-semibold text-[var(--text-1)]">
        Bulk discount tiers
      </h2>
      <p className="mt-1 text-sm text-[var(--text-2)]">
        The highest tier the buyer reaches applies to every unit. Percent off is calculated in minor units and rounded down, so the buyer pays the lower price.
      </p>
      {loading ? <p className="mt-3 text-sm text-[var(--text-2)]">Loading tiers…</p> : null}
      {loadError ? (
        <p className="mt-3 text-sm text-[var(--red)]" role="alert">
          {loadError}
        </p>
      ) : null}
      {!loading && !loadError ? (
        <>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--text-3)]">Regular price</dt>
              <dd className="text-[var(--text-1)]">{baseUnit === null ? '—' : formatUsdt(baseUnit)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-3)]">Cost floor</dt>
              <dd className="text-[var(--text-1)]">{floorKnown && floor !== null ? formatUsdt(floor) : 'Unknown'}</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-[var(--text-2)]">{note}</p>
          {problems.length > 0 ? (
            <div
              ref={summaryRef}
              tabIndex={-1}
              role="alert"
              aria-labelledby={`${summaryId}-errors`}
              className="mt-3 rounded-md border border-[var(--red)] p-3"
            >
              <h3 id={`${summaryId}-errors`} className="text-sm font-semibold text-[var(--text-1)]">
                There is a problem
              </h3>
              <ul className="mt-2 list-disc pl-5 text-sm text-[var(--red)]">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {liveError && problems.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--red)]" role="status">
              {liveError}
            </p>
          ) : null}
          <div className="mt-4 grid gap-3">
            {rows.map((row, index) => (
              <div key={index} className="grid gap-2 rounded-md border border-[var(--border)] p-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-[var(--text-2)]" htmlFor={`${summaryId}-qty-${index}`}>
                  Minimum quantity
                  <input
                    id={`${summaryId}-qty-${index}`}
                    value={row.minQty}
                    inputMode="numeric"
                    className="btc-input min-h-11"
                    onChange={(event) => patch(index, { minQty: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-[var(--text-2)]" htmlFor={`${summaryId}-price-${index}`}>
                  Unit price (USDT)
                  <input
                    id={`${summaryId}-price-${index}`}
                    value={row.unitPrice}
                    inputMode="decimal"
                    className="btc-input min-h-11"
                    aria-describedby={`${summaryId}-price-help`}
                    onChange={(event) => patch(index, { unitPrice: event.target.value })}
                  />
                </label>
                <div className="flex flex-col gap-1 text-sm text-[var(--text-2)] sm:col-span-2">
                  <label htmlFor={`${summaryId}-percent-${index}`}>Percent off the regular price</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id={`${summaryId}-percent-${index}`}
                      value={row.percent}
                      inputMode="decimal"
                      className="btc-input min-h-11 sm:max-w-40"
                      onChange={(event) => patch(index, { percent: event.target.value })}
                    />
                    <button type="button" className="btc-btn-secondary min-h-11" onClick={() => applyPercent(index)}>
                      Fill price
                    </button>
                    <button
                      type="button"
                      className="btc-btn-secondary min-h-11"
                      onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p id={`${summaryId}-price-help`} className="mt-2 text-xs text-[var(--text-3)]">
            A 10% off price is regular × 90 / 100, dropping any leftover minor unit.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btc-btn-secondary min-h-11"
              disabled={rows.length >= 5}
              onClick={() => setRows((current) => [...current, EMPTY_ROW])}
            >
              Add tier
            </button>
            <button type="button" className="btc-btn-primary min-h-11" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save tiers'}
            </button>
          </div>
          {saved ? (
            <p className="mt-3 text-sm text-[var(--green)]" role="status">
              Tiers saved for {productTitle}.
            </p>
          ) : null}
          <div className="mt-4 rounded-2xl bg-[var(--bg-raised)] p-3 text-sm text-[var(--text-1)]" aria-label="Telegram preview">
            <p className="mb-2 text-xs text-[var(--text-3)]">Telegram preview</p>
            {preview ? <PreviewHtml html={preview} /> : <p className="text-[var(--text-3)]">Add a valid tier to preview it.</p>}
          </div>
        </>
      ) : null}
    </section>
  );
}
