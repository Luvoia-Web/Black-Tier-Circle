'use client';

/**
 * @file components/orders/mark-fulfilled-button.tsx
 *
 * Owner control to mark a manual order fulfilled, with confirmation.
 *
 * @module Components
 */

import { useState } from 'react';
import { API_ROUTES } from '@/lib/navigation';

type MarkFulfilledButtonProps = {
  readonly orderId: string;
  readonly noteEnabled?: boolean;
};

/**
 * Marks a manual order fulfilled after confirmation.
 *
 * @param props - Order id and optional note field
 */
export function MarkFulfilledButton({ orderId, noteEnabled = false }: MarkFulfilledButtonProps): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.fulfillmentManualComplete(orderId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteEnabled && note.trim().length > 0 ? { note } : {}),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to mark fulfilled');
        return;
      }
      window.location.reload();
    } catch {
      setError('Unable to mark fulfilled');
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  }

  return (
    <div>
      {noteEnabled ? (
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Optional note"
          className="mb-2 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
        />
      ) : null}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={saving}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        Mark Fulfilled
      </button>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      {confirming ? (
        <div className="mt-3 rounded-md border border-yellow-700 bg-yellow-500/10 p-3 text-sm text-yellow-100">
          <p>Mark this order as fulfilled? The customer will be notified.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                void submit();
              }}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-white"
            >
              Confirm
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-md bg-gray-800 px-3 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
