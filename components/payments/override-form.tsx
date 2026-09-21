'use client';

/**
 * @file components/payments/override-form.tsx
 *
 * Owner manual payment override with confirmation.
 *
 * @module Components
 */

import { useState } from 'react';
import { API_ROUTES } from '@/lib/navigation';

type OverrideFormProps = {
  readonly orderId: string;
};

/**
 * Force verify / force fail controls.
 */
export function PaymentOverrideForm({ orderId }: OverrideFormProps): JSX.Element {
  const [reason, setReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<'verify' | 'fail' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(action: 'verify' | 'fail'): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.adminPaymentOverride(orderId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Override failed');
        return;
      }
      window.location.reload();
    } catch {
      setError('Override failed');
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="text-lg font-medium text-[var(--text-1)]">Manual override</h2>
      <p className="mt-1 text-sm text-[var(--text-2)]">Requires a reason of at least 10 characters.</p>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="mt-3 w-full rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text-1)]"
        rows={3}
        placeholder="Explain why this payment is being overridden"
      />
      {error ? <p className="mt-2 text-sm text-[var(--red)]">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={saving || reason.trim().length < 10}
          onClick={() => setConfirmAction('verify')}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Force Verify
        </button>
        <button
          type="button"
          disabled={saving || reason.trim().length < 10}
          onClick={() => setConfirmAction('fail')}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Force Fail
        </button>
      </div>
      {confirmAction ? (
        <div className="mt-4 rounded-md border border-yellow-700 bg-[var(--amber-soft)] p-4 text-sm text-yellow-100">
          <p>
            Confirm {confirmAction === 'verify' ? 'force verify' : 'force fail'}? This writes an audit log entry.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                void submit(confirmAction);
              }}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-white"
            >
              Confirm
            </button>
            <button type="button" onClick={() => setConfirmAction(null)} className="rounded-md bg-[var(--bg-raised)] px-3 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
