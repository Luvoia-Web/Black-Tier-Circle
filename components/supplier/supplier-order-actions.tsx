'use client';

/**
 * @file components/supplier/supplier-order-actions.tsx
 *
 * Manual complete, fail, and re-submit controls for a supplier order.
 *
 * @module Components
 */

import { useState } from 'react';
import { API_ROUTES } from '@/lib/navigation';

type SupplierOrderActionsProps = {
  readonly orderId: string;
  readonly canAct: boolean;
};

/**
 * Owner manual actions for supplier fulfillment.
 */
export function SupplierOrderActions({ orderId, canAct }: SupplierOrderActionsProps): JSX.Element {
  const [deliveryData, setDeliveryData] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function post(url: string, body: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to update supplier order');
        return false;
      }
      window.location.reload();
      return true;
    } catch {
      setError('Unable to update supplier order');
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (!canAct) {
    return <p className="text-sm text-gray-400">No manual supplier actions available for this status.</p>;
  }

  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        Delivery data
        <textarea
          value={deliveryData}
          onChange={(event) => setDeliveryData(event.target.value)}
          rows={3}
          className="rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-gray-100"
          placeholder="URL, license key, or instructions"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        Note
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-gray-100"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || deliveryData.trim().length === 0}
          onClick={() => {
            void post(API_ROUTES.supplierManualComplete(orderId), { deliveryData, note });
          }}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Mark as Completed
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void post(API_ROUTES.supplierManualFail(orderId), { note });
          }}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Mark as Failed
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void post(API_ROUTES.supplierResubmit(orderId), {});
          }}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Re-submit to Supplier
        </button>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
