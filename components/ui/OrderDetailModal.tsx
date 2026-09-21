'use client';

/**
 * @file components/ui/OrderDetailModal.tsx
 *
 * Slide-in drawer showing full order detail.
 *
 * Opens from the eye icon on order tables and the Review button on the
 * payment monitor. Fetches GET /api/orders/[orderId]/detail and never
 * mutates orders itself except by calling existing action endpoints.
 *
 * @module Components
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, RotateCw, X } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import {
  customerDisplayName,
  deliveredContentLabel,
  formatOrderTimestamp,
  formatOrderTotal,
  headerPaymentBadge,
  isResellerOrderChannel,
  paymentMethodLabel,
  paymentRefValue,
  truncatePaymentRef,
  type OrderDetailPayload,
  type OrderHeaderBadge,
} from '@/lib/order-detail';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

type OrderDetailModalProps = {
  readonly orderId: string | null;
  readonly onClose: () => void;
  readonly onActionComplete?: (() => void) | undefined;
};

const BADGE_VARIANT: Record<OrderHeaderBadge, BadgeVariant> = {
  paid: 'success',
  verified: 'success',
  pending: 'warning',
  failed: 'danger',
};

const CLOSE_ANIMATION_MS = 150;

const DRAWER_CLASS =
  'fixed right-0 top-0 flex h-full w-[480px] flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-card)] max-md:bottom-0 max-md:top-auto max-md:h-auto max-md:max-h-[90vh] max-md:w-full max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t';

/**
 * Slide-in order detail drawer. Renders nothing when `orderId` is null.
 *
 * @param props - Selected order id and close handler
 */
export function OrderDetailModal({
  orderId,
  onClose,
  onActionComplete,
}: OrderDetailModalProps): JSX.Element | null {
  const [isClosing, setIsClosing] = useState(false);
  const handleClose = useCallback((): void => {
    setIsClosing(true);
    window.setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, CLOSE_ANIMATION_MS);
  }, [onClose]);

  useEscapeToClose(orderId, handleClose);
  useLockBodyScroll(orderId);

  if (orderId === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close order details"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-title"
        className={`${DRAWER_CLASS} ${isClosing ? 'drawer-exit' : 'drawer-enter'}`}
      >
        <OrderDetailContent
          orderId={orderId}
          onClose={handleClose}
          onActionComplete={onActionComplete}
        />
      </aside>
    </div>
  );
}

export default OrderDetailModal;

type ContentProps = {
  readonly orderId: string;
  readonly onClose: () => void;
  readonly onActionComplete?: (() => void) | undefined;
};

function OrderDetailContent({ orderId, onClose, onActionComplete }: ContentProps): JSX.Element {
  const { detail, loading, error, reload } = useOrderDetail(orderId);
  const actions = useDrawerActions(detail, reload, onActionComplete);
  return (
    <>
      <OrderDetailHeader detail={detail} onClose={onClose} />
      <div className="flex-1 px-6 py-4">
        {loading ? <p className="text-sm text-[var(--text-2)]">Loading order…</p> : null}
        {error ? <p className="text-sm text-[var(--red)]">{error}</p> : null}
        {detail ? <OrderDetailBody detail={detail} /> : null}
      </div>
      {detail ? <OrderDetailActions detail={detail} actions={actions} /> : null}
    </>
  );
}

function OrderDetailHeader({
  detail,
  onClose,
}: {
  readonly detail: OrderDetailPayload | null;
  readonly onClose: () => void;
}): JSX.Element {
  const badge = detail ? headerPaymentBadge(detail.order.paymentStatus) : null;
  const timestamp = detail ? formatOrderTimestamp(detail.order.createdAt) : '';
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
      <div>
        <h2 id="order-detail-title" className="text-base font-semibold text-[var(--text-1)]">
          Order details
        </h2>
        {badge ? (
          <Badge variant={BADGE_VARIANT[badge]} className="mt-1">
            {badge}
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        {timestamp ? <span className="text-sm text-[var(--text-2)]">{timestamp}</span> : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-raised)] hover:bg-[var(--bg-hover)]"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}

function OrderDetailBody({ detail }: { readonly detail: OrderDetailPayload }): JSX.Element {
  const rows = buildDrawerRows(detail);
  const deliveredContent = detail.deliveredContent;
  const showDelivered = detail.fulfillmentAttempt !== null && deliveredContent !== null;
  return (
    <>
      <div>
        {rows.map((row) => (
          <DetailRow key={row.label} label={row.label} value={row.value} copyText={row.copyText} isTotal={row.isTotal} />
        ))}
      </div>
      {detail.fulfillmentAttempt !== null && deliveredContent !== null ? (
        <DeliveredContentBox
          label={deliveredContentLabel(detail.product.deliveryType)}
          content={deliveredContent}
        />
      ) : null}
      {!showDelivered && isDeliveryPending(detail) ? (
        <div className="py-2 text-sm italic text-[var(--text-2)]">Delivery pending...</div>
      ) : null}
    </>
  );
}

type DrawerRow = {
  readonly label: string;
  readonly value: string;
  readonly copyText: string | null;
  readonly isTotal: boolean;
};

function buildDrawerRows(detail: OrderDetailPayload): ReadonlyArray<DrawerRow> {
  const ref = paymentRefValue(detail.paymentClaim);
  const verifiedAt = detail.paymentClaim?.verifiedAt ?? null;
  return [
    { label: 'ORDER ID', value: detail.order.id.slice(0, 8).toUpperCase(), copyText: detail.order.id, isTotal: false },
    { label: 'PAYMENT REF', value: ref ? truncatePaymentRef(ref) : '—', copyText: ref, isTotal: false },
    { label: 'TYPE', value: 'purchase', copyText: null, isTotal: false },
    { label: 'PRODUCT', value: detail.product.title, copyText: null, isTotal: false },
    { label: 'QUANTITY', value: '1', copyText: null, isTotal: false },
    { label: 'TOTAL', value: formatOrderTotal(detail.order.quotedRetailPrice), copyText: null, isTotal: true },
    { label: 'METHOD', value: paymentMethodLabel(detail.order.paymentMethod), copyText: null, isTotal: false },
    { label: 'CUSTOMER', value: customerDisplayName(detail.customer), copyText: null, isTotal: false },
    {
      label: 'TELEGRAM CHAT',
      value: detail.customer?.telegramChatId ?? '—',
      copyText: null,
      isTotal: false,
    },
    { label: 'VERIFIED AT', value: verifiedAt ? formatOrderTimestamp(verifiedAt) : '—', copyText: null, isTotal: false },
    { label: 'LAST UPDATED', value: formatOrderTimestamp(detail.order.updatedAt), copyText: null, isTotal: false },
  ];
}

function DetailRow({
  label,
  value,
  copyText,
  isTotal,
}: {
  readonly label: string;
  readonly value: string;
  readonly copyText: string | null;
  readonly isTotal: boolean;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between border-b border-[var(--border)] py-3 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-3)]">{label}</span>
      <span
        className={`flex max-w-[60%] items-start justify-end gap-2 break-all text-right text-sm ${isTotal ? 'font-semibold text-[var(--amber)]' : 'text-[var(--text-1)]'}`}
      >
        {value}
        {copyText ? <CopyButton text={copyText} /> : null}
      </span>
    </div>
  );
}

function DeliveredContentBox({ label, content }: { readonly label: string; readonly content: string }): JSX.Element {
  return (
    <div className="mt-4">
      <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-3)]">{label}</span>
      <div className="mb-4 mt-2 flex items-center justify-between gap-3 rounded-[var(--r-md)] border border-[var(--border-soft)] bg-[var(--bg-raised)] px-4 py-3">
        <span className="flex-1 break-all font-mono text-sm text-[var(--text-1)]">{content}</span>
        <CopyButton text={content} />
      </div>
    </div>
  );
}

type DrawerActions = {
  readonly isBusy: boolean;
  readonly actionError: string | null;
  readonly onOverride: () => void;
  readonly onCancel: () => void;
  readonly onMarkFulfilled: () => void;
  readonly onRetry: () => void;
};

function OrderDetailActions({
  detail,
  actions,
}: {
  readonly detail: OrderDetailPayload;
  readonly actions: DrawerActions;
}): JSX.Element {
  const order = detail.order;
  const isVerified = order.paymentStatus === 'verified' && order.fulfillmentStatus !== 'canceled';
  return (
    <div className="sticky bottom-0 space-y-3 border-t border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
      {order.deliveryStatus === 'sent' ? <ReturnAction /> : null}
      {isVerified && isResellerOrderChannel(order.channel) ? (
        <RefundAction amountLabel={formatOrderTotal(order.quotedRetailPrice)} />
      ) : null}
      {isVerified && !isResellerOrderChannel(order.channel) ? <OwnerManageActions actions={actions} /> : null}
      {order.paymentStatus === 'awaiting' || order.paymentStatus === 'pending_verification' ? (
        <p className="text-[var(--text-2)]">Waiting for payment</p>
      ) : null}
      {order.fulfillmentStatus === 'manual_pending' ? (
        <button type="button" disabled={actions.isBusy} onClick={actions.onMarkFulfilled} className="btc-btn-primary w-full">
          ✓ Mark as Fulfilled
        </button>
      ) : null}
      {order.deliveryStatus === 'unreachable' || order.deliveryStatus === 'retry_pending' ? (
        <RetryAction actions={actions} />
      ) : null}
      {actions.actionError ? <p className="text-sm text-[var(--red)]">{actions.actionError}</p> : null}
    </div>
  );
}

function ReturnAction(): JSX.Element {
  return (
    <button
      type="button"
      disabled
      className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-4 py-2.5 text-sm text-[var(--text-3)]"
      title="Coming soon"
    >
      ↩ Return &amp; remove from buyer&apos;s chat
      <span className="ml-auto rounded-full bg-[var(--bg-overlay)] px-2 py-0.5 text-xs">Soon</span>
    </button>
  );
}

function RefundAction({ amountLabel }: { readonly amountLabel: string }): JSX.Element {
  return (
    <div>
      {/* TODO(post-launch): implement refund flow — reverses payment, credits reseller wallet */}
      <button
        type="button"
        disabled
        className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-4 py-2.5 text-sm text-[var(--text-3)]"
        title="Coming soon"
      >
        Refund {amountLabel} to wallet
        <span className="ml-auto rounded-full bg-[var(--bg-overlay)] px-2 py-0.5 text-xs">Soon</span>
      </button>
    </div>
  );
}

function OwnerManageActions({ actions }: { readonly actions: DrawerActions }): JSX.Element {
  return (
    <div className="space-y-3">
      <button type="button" disabled={actions.isBusy} onClick={actions.onOverride} className="btc-btn-secondary w-full">
        Override Payment
      </button>
      <button
        type="button"
        disabled={actions.isBusy}
        onClick={actions.onCancel}
        className="w-full rounded-[var(--r-md)] border border-[var(--red)]/20 bg-[var(--red-soft)] py-3 font-medium text-[var(--red)] hover:bg-red-500/20 disabled:opacity-60"
      >
        Cancel Order
      </button>
    </div>
  );
}

function RetryAction({ actions }: { readonly actions: DrawerActions }): JSX.Element {
  return (
    <button
      type="button"
      disabled={actions.isBusy}
      onClick={actions.onRetry}
      className="btc-btn-secondary flex w-full items-center justify-center gap-2"
    >
      <RotateCw size={16} />
      Retry Delivery
    </button>
  );
}

function useDrawerActions(
  detail: OrderDetailPayload | null,
  reload: () => Promise<void>,
  onActionComplete: (() => void) | undefined,
): DrawerActions {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const orderId = detail?.order.id ?? null;

  const runAction = useCallback(
    async (url: string, body?: Record<string, unknown> | undefined): Promise<void> => {
      setIsBusy(true);
      setActionError(null);
      try {
        const message = await postOrderAction(url, body);
        if (message !== null) {
          setActionError(message);
          return;
        }
        await reload();
        onActionComplete?.();
      } finally {
        setIsBusy(false);
      }
    },
    [onActionComplete, reload],
  );

  return buildDrawerActionHandlers(orderId, router, runAction, isBusy, actionError);
}

function buildDrawerActionHandlers(
  orderId: string | null,
  router: { readonly push: (href: string) => void },
  runAction: (url: string, body?: Record<string, unknown> | undefined) => Promise<void>,
  isBusy: boolean,
  actionError: string | null,
): DrawerActions {
  return {
    isBusy,
    actionError,
    onOverride: () => {
      if (orderId) {
        router.push(ROUTES.owner.paymentDetail(orderId));
      }
    },
    onCancel: () => {
      if (orderId && window.confirm('Cancel this order and release any wallet reservation?')) {
        void runAction(API_ROUTES.orderCancel(orderId), { reason: 'Cancelled by owner' });
      }
    },
    onMarkFulfilled: () => {
      if (orderId && window.confirm('Mark this order as fulfilled? The customer will be notified.')) {
        void runAction(API_ROUTES.fulfillmentManualComplete(orderId), {});
      }
    },
    onRetry: () => {
      if (orderId) {
        void runAction(API_ROUTES.fulfillmentRetryDelivery(orderId));
      }
    },
  };
}

function CopyButton({ text }: { readonly text: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  async function handleCopy(): Promise<void> {
    const didCopy = await copyToClipboard(text);
    if (!didCopy) {
      return;
    }
    setCopied(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 2000);
  }

  return (
    <button
      type="button"
      onClick={() => {
        void handleCopy();
      }}
      aria-label={copied ? 'Copied' : 'Copy'}
      className="shrink-0 text-[var(--text-3)] hover:text-[var(--text-1)]"
    >
      {copied ? <Check size={14} className="text-[var(--green)]" /> : <Copy size={14} />}
    </button>
  );
}

function useEscapeToClose(orderId: string | null, onClose: () => void): void {
  useEffect(() => {
    if (orderId === null) {
      return undefined;
    }
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [orderId, onClose]);
}

function useLockBodyScroll(orderId: string | null): void {
  useEffect(() => {
    if (orderId === null) {
      return undefined;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [orderId]);
}

function useOrderDetail(orderId: string): {
  readonly detail: OrderDetailPayload | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
} {
  const [detail, setDetail] = useState<OrderDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await fetchOrderDetail(orderId);
      setDetail(loaded.detail);
      setError(loaded.error);
    } catch {
      setDetail(null);
      setError('Unable to load order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { detail, loading, error, reload };
}

async function fetchOrderDetail(
  orderId: string,
): Promise<{ readonly detail: OrderDetailPayload | null; readonly error: string | null }> {
  const response = await fetch(API_ROUTES.orderDetail(orderId));
  const json = (await response.json()) as {
    success: boolean;
    data?: OrderDetailPayload;
    error?: { message: string };
  };
  if (!json.success || json.data === undefined) {
    return { detail: null, error: json.error?.message ?? 'Unable to load order' };
  }
  return { detail: json.data, error: null };
}

async function postOrderAction(url: string, body?: Record<string, unknown> | undefined): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      return json.error?.message ?? 'Action failed';
    }
    return null;
  } catch {
    return 'Action failed';
  }
}

function isDeliveryPending(detail: OrderDetailPayload): boolean {
  const paid = detail.order.paymentStatus === 'verified' || detail.order.paymentStatus === 'not_required';
  const fulfilled = detail.order.fulfillmentStatus === 'ready' || detail.order.deliveryStatus === 'sent';
  return paid || fulfilled;
}
