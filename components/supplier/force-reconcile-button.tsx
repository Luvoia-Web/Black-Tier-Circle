'use client';

/**
 * @file components/supplier/force-reconcile-button.tsx
 *
 * Forces reconciliation for one outcome_unknown order.
 *
 * @module Components
 */

import { useState } from 'react';
import { API_ROUTES } from '@/lib/navigation';

type ForceReconcileButtonProps = {
  readonly orderId: string;
};

/**
 * Owner control to poll the supplier immediately for one order.
 */
export function ForceReconcileButton({ orderId }: ForceReconcileButtonProps): JSX.Element {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.supplierForceReconcile(orderId), { method: 'POST' });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to reconcile');
        return;
      }
      window.location.reload();
    } catch {
      setError('Unable to reconcile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          void submit();
        }}
        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {saving ? 'Checking…' : 'Force Reconcile'}
      </button>
      {error ? <p className="mt-1 text-xs text-[var(--red)]">{error}</p> : null}
    </div>
  );
}
