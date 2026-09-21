'use client';

/**
 * @file components/orders/order-actions.tsx
 *
 * Owner order-detail actions: note, retry delivery, cancel.
 *
 * @module Components
 */

import { useState } from 'react';
import { MarkFulfilledButton } from '@/components/orders/mark-fulfilled-button';
import { API_ROUTES, ROUTES } from '@/lib/navigation';

type OrderActionsProps = {
  readonly orderId: string;
  readonly fulfillmentStatus: string;
  readonly deliveryStatus: string;
  readonly paymentStatus: string;
};

/**
 * Owner-only support tools for a single order.
 *
 * @param props - Current track statuses
 */
export function OrderActions({
  orderId,
  fulfillmentStatus,
  deliveryStatus,
  paymentStatus,
}: OrderActionsProps): JSX.Element {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function post(url: string, body?: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Action failed');
        return false;
      }
      window.location.reload();
      return true;
    } catch {
      setError('Action failed');
      return false;
    } finally {
      setSaving(false);
    }
  }

  const canCancel = fulfillmentStatus !== 'ready' && deliveryStatus !== 'sent' && fulfillmentStatus !== 'canceled';

  return (
    <section className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="text-lg font-medium text-[var(--text-1)]">Actions</h2>
      {fulfillmentStatus === 'manual_pending' ? (
        <div className="mt-3">
          <MarkFulfilledButton orderId={orderId} noteEnabled />
        </div>
      ) : null}
      {deliveryStatus === 'unreachable' || deliveryStatus === 'retry_pending' ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void post(API_ROUTES.fulfillmentRetryDelivery(orderId));
          }}
          className="mt-3 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Retry Delivery
        </button>
      ) : null}
      {paymentStatus === 'failed' || paymentStatus === 'pending_verification' ? (
        <p className="mt-3 text-sm">
          <a href={ROUTES.owner.paymentDetail(orderId)} className="text-[var(--accent-soft)] hover:text-[var(--accent)]">
            Override Payment
          </a>
        </p>
      ) : null}
      <div className="mt-4">
        <label className="text-sm text-[var(--text-2)]" htmlFor="order-note">
          Add note
        </label>
        <textarea
          id="order-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={saving || note.trim().length < 3}
          onClick={() => {
            void post(API_ROUTES.orderNote(orderId), { note });
          }}
          className="mt-2 rounded-md bg-[var(--bg-hover)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Save note
        </button>
      </div>
      {canCancel ? (
        <div className="mt-6 rounded-md border border-red-900 bg-red-950/40 p-4">
          <h3 className="text-sm font-medium text-red-300">Danger zone</h3>
          <p className="mt-1 text-sm text-[var(--text-2)]">Cancel this order and release any wallet reservation.</p>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              void post(API_ROUTES.orderCancel(orderId), { reason: 'Cancelled by owner' });
            }}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Cancel Order
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-[var(--red)]">{error}</p> : null}
    </section>
  );
}
