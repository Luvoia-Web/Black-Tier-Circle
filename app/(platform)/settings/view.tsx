'use client';

/**
 * Settings. The owner locks reseller fields here. A missing 0032 column is shown, not guessed.
 */

import { useState } from 'react';
import { Button, EmptyState, ErrorState } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';

type PolicyField = { readonly key: string; readonly label: string; readonly allowed: boolean };

type SettingsPayload = {
  readonly role: 'owner' | 'reseller';
  readonly displayName: string;
  readonly tenantName: string | null;
  readonly needsMigration: boolean;
  readonly fields: readonly PolicyField[];
  readonly fraud: {
    readonly ordersPerHour: number;
    readonly ordersPerDay: number;
    readonly failedClaimsPerHour: number;
    readonly supportMessagesPerHour: number;
    readonly referralClaimsPerDay: number;
    readonly newAccountOrderCap: number;
    readonly newAccountAgeHours: number;
  };
};

export function SettingsView(): JSX.Element {
  const settings = useData<SettingsPayload>('/api/platform/settings');
  const [draft, setDraft] = useState<Record<string, boolean> | null>(null);
  const [note, setNote] = useState('');

  if (settings.loading && !settings.data) {
    return <p className="text-sm text-ink-soft">Loading settings…</p>;
  }
  if (settings.error && !settings.data) {
    return <ErrorState message={settings.error.message} onRetry={settings.refetch} />;
  }
  if (!settings.data) {
    return <EmptyState title="Settings are not available" message="Refresh the page and try again." />;
  }
  const loaded = settings.data;
  const values = draft ?? Object.fromEntries(loaded.fields.map((field) => [field.key, field.allowed]));
  const locked = loaded.fields.filter((field) => values[field.key] === false);

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <div>
        <h1 className="text-xl text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {loaded.displayName}
          {loaded.tenantName ? ` · ${loaded.tenantName}` : ''}
          {loaded.role === 'owner' ? ' · Owner' : ' · Reseller'}
        </p>
      </div>
      {loaded.needsMigration ? (
        <p className="rounded-md border border-stroke px-3 py-2 text-sm text-ink">Reseller policy and fraud thresholds need migration 0032 before they can be saved. Buyers are not blocked by the missing columns.</p>
      ) : null}
      {loaded.fields.length === 0 ? (
        <EmptyState title="No policy fields" message="The reseller policy has nothing to edit." />
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm text-ink">Reseller policy</h2>
          <p className="text-sm text-ink-soft">
            {loaded.role === 'owner'
              ? 'A locked field is rejected on the reseller API. The saved value stays as it is. Everything starts allowed.'
              : locked.length === 0
                ? 'The owner has not locked any of your fields.'
                : `Locked: ${locked.map((field) => field.label).join(', ')}.`}
          </p>
          <ul className="divide-y divide-stroke overflow-hidden rounded-md border border-stroke">
            {loaded.fields.map((field) => (
              <li key={field.key} className="flex min-h-11 flex-wrap items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-ink">{field.label}</span>
                {loaded.role === 'owner' ? (
                  <button
                    type="button"
                    className="min-h-11 rounded-md px-3 text-sm text-ink"
                    aria-pressed={values[field.key] !== false}
                    disabled={loaded.needsMigration}
                    onClick={() => setDraft({ ...values, [field.key]: values[field.key] === false })}
                  >
                    {values[field.key] === false ? 'Locked' : 'Allowed'}
                  </button>
                ) : (
                  <span className="text-sm text-ink-soft">{values[field.key] === false ? 'Locked' : 'Allowed'}</span>
                )}
              </li>
            ))}
          </ul>
          {loaded.role === 'owner' ? (
            <Button
              disabled={loaded.needsMigration}
              onClick={() => {
                setNote('');
                void runAction('/api/platform/settings', { method: 'PATCH', body: { policy: values } }).then((result) => {
                  if (!result.ok) {
                    setNote(result.error.message);
                    return;
                  }
                  setDraft(null);
                  setNote('Reseller policy saved.');
                  settings.refetch();
                });
              }}
            >
              Save policy
            </Button>
          ) : null}
          {note ? <p className="text-sm text-ink">{note}</p> : null}
        </section>
      )}
      <section className="space-y-2">
        <h2 className="text-sm text-ink">Fraud thresholds</h2>
        <p className="text-sm text-ink-soft">
          {loaded.fraud.ordersPerHour} orders an hour, {loaded.fraud.ordersPerDay} a day, {loaded.fraud.failedClaimsPerHour} failed claims an hour, {loaded.fraud.supportMessagesPerHour} support messages an hour, {loaded.fraud.referralClaimsPerDay} referral claims a day. A buyer younger than {loaded.fraud.newAccountAgeHours} hours is limited to {loaded.fraud.newAccountOrderCap} orders in each window.
        </p>
      </section>
    </div>
  );
}
