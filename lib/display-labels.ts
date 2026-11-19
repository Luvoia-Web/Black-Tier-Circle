/**
 * @file lib/display-labels.ts
 *
 * Plain-English labels for enums, order tracks, memory types, ledger entries,
 * audit actions, and inline ISO dates so no raw snake_case or ISO dates appear.
 */

import { formatUsdt } from '@/lib/money';

function humanizeToken(raw: string): string {
  const cleaned = raw.trim().replace(/[._]+/g, ' ').replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const ORDER_TRACK_LABELS: Record<string, Readonly<Record<string, string>>> = {
  payment: {
    not_required: 'No payment required',
    awaiting: 'Awaiting payment',
    pending_verification: 'Checking payment',
    verified: 'Paid',
    failed: 'Payment failed',
    expired: 'Payment expired',
    refund_pending: 'Refund started',
    refunded: 'Refunded',
    disputed: 'Payment disputed',
  },
  funding: {
    not_applicable: 'Direct store order',
    reserved: 'Reseller balance reserved',
    debited: 'Reseller balance charged',
    released: 'Reservation released',
    reversal_pending: 'Reversal started',
    reversed: 'Balance reversed',
  },
  fulfillment: {
    queued: 'Queued for fulfillment',
    processing: 'Preparing order',
    manual_pending: 'Waiting for manual fulfillment',
    supplier_pending: 'Sent to supplier',
    outcome_unknown: 'Checking supplier result',
    ready: 'Ready to deliver',
    failed: 'Supplier rejected the order',
    canceled: 'Cancelled',
  },
  delivery: {
    not_ready: 'Waiting to deliver',
    queued: 'Queued for delivery',
    sending: 'Sending to buyer',
    sent: 'Delivered',
    retry_pending: 'Retry scheduled',
    unreachable: 'Buyer unreachable',
    review_required: 'Needs delivery review',
  },
};

export function displayOrderEventLabel(track: string, toStatus: string): string {
  const mapped = ORDER_TRACK_LABELS[track]?.[toStatus];
  if (mapped) return mapped;
  return humanizeToken(`${track} ${toStatus}`);
}

const KNOWN_ERROR_NOTES: Readonly<Record<string, string>> = {
  AMOUNT_MISMATCH: 'Payment amount did not match what was expected',
  AMOUNT_TOO_SMALL: 'Payment amount was below the expected amount',
  TOO_FEW_CONFIRMATIONS: 'Transfer needs more network confirmations',
  TX_FAILED: 'Blockchain transaction failed',
  WRONG_TOKEN: 'Transfer used a different token instead of USDT',
  WRONG_RECIPIENT: 'Transfer went to a different address',
  NO_TRANSFER: 'No USDT transfer found in that transaction',
  ALREADY_USED: 'Transaction hash was already used',
  NOT_FOUND: 'Transaction not found on chain yet',
  EXPIRED: 'Top-up window expired',
  TOO_EARLY: 'Transfer happened before the request was created',
  BINANCE_NOT_PAID: 'Binance Pay order was not paid yet',
  INSUFFICIENT_BALANCE: 'Balance is too low',
  OUT_OF_STOCK: 'Product is out of stock',
};

export function displayOrderEventNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const trimmed = note.trim();
  if (!trimmed || trimmed.toLowerCase() === 'initial') return null;
  if (KNOWN_ERROR_NOTES[trimmed]) return KNOWN_ERROR_NOTES[trimmed];
  return trimmed.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, (token) => token.replace(/_/g, ' '));
}

const DELIVERY_TYPES: Readonly<Record<string, string>> = {
  email_activation: 'Email activation',
  supplier_api: 'Supplier API',
  inventory_unit: 'Stock key',
  file_reusable: 'Reusable file',
  manual: 'Manual delivery',
  instant: 'Instant',
};

export function displayDeliveryType(type: string): string {
  return DELIVERY_TYPES[type] ?? humanizeToken(type);
}

export function displayMarkup(kind: string, value: string | number): string {
  if (kind === 'percent') return `${value}%`;
  return `${value} USDT`;
}

export function displayDiscountValue(kind: string, value: string): string {
  if (kind === 'percent') return `${value}% off`;
  try {
    return `${formatUsdt(BigInt(value))} off`;
  } catch {
    return `${value} USDT off`;
  }
}

const MEMORY_TYPES: Readonly<Record<string, string>> = {
  memory_decision: 'Decision',
  world: 'Fact',
  experience: 'Experience',
  opinion: 'Observation',
  entity: 'Entity',
  decision: 'Decision',
};

export function displayMemoryType(type: string): string {
  return MEMORY_TYPES[type] ?? humanizeToken(type);
}

function formatUtcDate(year: number, month: number, day: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(dt.getTime())) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatPlainDatesInText(raw: string): string {
  const withoutHtml = raw.replace(/<\/?[a-z][^>]*>/gi, '');
  const withoutIsoTs = withoutHtml.replace(
    /\b(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?\b/g,
    (_m, y, mo, d) => formatUtcDate(Number(y), Number(mo), Number(d)),
  );
  const withoutIsoDate = withoutIsoTs.replace(
    /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    (_m, y, mo, d) => formatUtcDate(Number(y), Number(mo), Number(d)),
  );
  return withoutIsoDate.replace(/\b[a-z]{2,}_[a-z0-9_]{2,}\b/g, (token) => token.replace(/_/g, ' '));
}

const LEDGER_KINDS: Readonly<Record<string, string>> = {
  top_up_credit: 'Top-up credit',
  manual_credit: 'Manual credit',
  manual_debit: 'Manual debit',
  wholesale_debit: 'Wholesale charge',
  wholesale_reversal: 'Wholesale reversal',
  reservation: 'Balance reserved',
  reservation_release: 'Reservation released',
};

export function displayLedgerEntryType(kind: string): string {
  return LEDGER_KINDS[kind] ?? humanizeToken(kind);
}

const AUDIT_ACTIONS: Readonly<Record<string, string>> = {
  'settings.signout_others': 'Signed out other sessions',
  'settings.policy': 'Updated reseller policy',
  'settings.business': 'Updated business settings',
  'settings.legal': 'Updated legal policies',
  'settings.fraud': 'Updated fraud thresholds',
  'settings.payments': 'Updated payment settings',
  'settings.notifications': 'Updated notifications',
  'settings.override': 'Updated store policy override',
  'settings.store': 'Updated store status',
  pricing_default_applied: 'Applied pricing defaults',
  'bot.rotate': 'Rotated bot token',
  'bot.pause': 'Paused bot',
  'bot.resume': 'Resumed bot',
  'bot.disconnect': 'Disconnected bot',
  'bot.reconnect': 'Re-set bot webhook',
  'bot.test': 'Sent Bot Studio test message',
  'topup.approve': 'Approved top-up',
  'topup.reject': 'Rejected top-up',
  'bulk_tiers.save': 'Saved bulk pricing tiers',
  'customer.block': 'Blocked buyer',
  'customer.unblock': 'Unblocked buyer',
  'customer.credit': 'Added wallet credit',
  'customer.debit': 'Deducted wallet credit',
  'customer.freeze': 'Blocked buyer',
  'customer.unfreeze': 'Unblocked buyer',
  'support.close': 'Closed support thread',
  'support.reopen': 'Reopened support thread',
  support_reply_sent: 'Sent support reply',
  support_reply_failed: 'Support reply failed',
  order_replaced: 'Sent warranty replacement',
  'fraud.blocked': 'Blocked account attempt',
  'fraud.order_refused': 'Unpaid order limit hit',
  'fraud.freebie_refused': 'Freebie daily limit hit',
  'fraud.discount_refused': 'Discount limit hit',
  'fraud.claim_refused': 'Failed claim limit hit',
  'fraud.support_refused': 'Support message limit hit',
  'fraud.referral_refused': 'Referral limit hit',
  'claim.failed': 'Failed payment claim',
  'reseller.approve': 'Approved reseller',
  'reseller.suspend': 'Suspended reseller',
  'reseller.unblock': 'Reactivated reseller',
  'reseller.invite': 'Sent reseller invite',
  'replacement.approved': 'Approved replacement',
  'replacement.rejected': 'Declined replacement',
  'token.create': 'Created credit token',
  'token.revoke': 'Revoked credit token',
  'wallet.credit': 'Credited reseller wallet',
  'wallet.debit': 'Debited reseller wallet',
  'payment.override': 'Overrode payment status',
  'assistant.chat': 'Asked Remy AI',
  'intelligence.ask': 'Queried platform intelligence',
};

export function displayAuditAction(action: string): string {
  return AUDIT_ACTIONS[action] ?? humanizeToken(action);
}

const SUPPORT_STATUSES: Readonly<Record<string, string>> = {
  open: 'Open',
  closed: 'Closed',
};

export function displaySupportStatus(status: string): string {
  return SUPPORT_STATUSES[status] ?? humanizeToken(status);
}

const REPLACEMENT_STATUSES: Readonly<Record<string, string>> = {
  pending: 'Pending',
  approved: 'Approved',
  replaced: 'Replaced',
  rejected: 'Declined',
};

export function displayReplacementStatus(status: string): string {
  return REPLACEMENT_STATUSES[status] ?? humanizeToken(status);
}

const TOPUP_STATUSES: Readonly<Record<string, string>> = {
  pending: 'Pending',
  credited: 'Credited',
  expired: 'Expired',
  failed: 'Failed',
  rejected: 'Rejected',
};

export function displayTopupStatus(status: string): string {
  return TOPUP_STATUSES[status] ?? humanizeToken(status);
}

const PAYMENT_STATUSES: Readonly<Record<string, string>> = {
  not_required: 'No payment required',
  awaiting: 'Awaiting payment',
  pending_verification: 'Checking payment',
  verified: 'Paid',
  failed: 'Failed',
  expired: 'Expired',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
  disputed: 'Disputed',
};

export function displayPaymentStatus(status: string): string {
  return PAYMENT_STATUSES[status] ?? humanizeToken(status);
}

const ORDER_CHANNELS: Readonly<Record<string, string>> = {
  owner_store: 'Owner store',
  reseller_bot: 'Reseller bot',
  api: 'API',
};

export function displayOrderChannel(channel: string): string {
  return ORDER_CHANNELS[channel] ?? humanizeToken(channel);
}

const PAYMENT_METHODS: Readonly<Record<string, string>> = {
  usdt_bep20: 'USDT BEP20',
  bep20: 'USDT BEP20',
  binance_pay: 'Binance Pay',
  wallet: 'Wallet balance',
  credit: 'Wallet balance',
  demo: 'Demo',
};

export function displayPaymentMethod(method: string | null | undefined): string {
  if (!method) return 'Wallet balance';
  return PAYMENT_METHODS[method] ?? humanizeToken(method);
}

const SUPPLIER_ORDER_STATUSES: Readonly<Record<string, string>> = {
  pending_fulfillment: 'Pending fulfillment',
  manual_pending: 'Waiting manual action',
  supplier_pending: 'Sent to supplier',
  outcome_unknown: 'Outcome unknown',
  ready: 'Ready',
  failed: 'Failed',
  canceled: 'Cancelled',
  queued: 'Queued',
  processing: 'Processing',
  completed: 'Completed',
};

export function displaySupplierOrderStatus(status: string): string {
  return SUPPLIER_ORDER_STATUSES[status] ?? humanizeToken(status);
}
