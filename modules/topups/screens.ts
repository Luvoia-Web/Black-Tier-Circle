/**
 * @file modules/topups/screens.ts
 *
 * Buyer-facing top-up copy. Every dynamic value is HTML-escaped.
 *
 * @module Topups
 */

import { escapeHtml } from '@/modules/store-config/sanitize';
import { formatUsdt, usdtToMinor } from '@/lib/money';
import { bep20MinConfirmations } from '@/integrations/bsc/verify';
import { TOPUP_FLOOR_MINOR, type TopupLimits, type WalletTopup } from '@/modules/topups';

export const QUICK_TOPUP_MINORS = [1_000_000n, 5_000_000n, 10_000_000n, 20_000_000n, 50_000_000n] as const;

export const NETWORK_WARNING =
  'Network: BNB Smart Chain (BEP20) only - sending on another network loses the money';

export function remainingTimeLabel(expiresAt: Date, now = new Date()): string {
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) {
    return 'expired';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

export function quickTopupAmounts(limits: TopupLimits): bigint[] {
  return QUICK_TOPUP_MINORS.filter((amount) => amount >= limits.min && amount <= limits.max);
}

export function topupAmountPrompt(limits: TopupLimits): string {
  return (
    `<b>Add USDT</b>\n\n` +
    `Choose an amount, or type your own.\n` +
    `Minimum ${escapeHtml(formatUsdt(limits.min))}. Maximum ${escapeHtml(formatUsdt(limits.max))}.`
  );
}

export function parseTopupAmount(
  text: string,
  limits: TopupLimits,
): { readonly ok: true; readonly amountMinor: bigint } | { readonly ok: false; readonly message: string } {
  try {
    const amountMinor = usdtToMinor(text.trim());
    if (amountMinor < limits.min || amountMinor < TOPUP_FLOOR_MINOR) {
      return { ok: false, message: `The minimum top-up is ${formatUsdt(limits.min)}.` };
    }
    if (amountMinor > limits.max) {
      return { ok: false, message: `The maximum top-up is ${formatUsdt(limits.max)}.` };
    }
    return { ok: true, amountMinor };
  } catch {
    return { ok: false, message: 'Send an amount like 10 or 12.50.' };
  }
}

export function topupInstructions(topup: WalletTopup, address: string, now = new Date(), reused = false): string {
  const when = topup.expiresAt.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  const lines = [
    `<b>Send USDT (BEP20)</b>`,
    '',
    `Send exactly <b>${escapeHtml(formatUsdt(topup.amountExpectedMinor))}</b>`,
    '',
    `To this address:`,
    `<code>${escapeHtml(address)}</code>`,
    '',
    NETWORK_WARNING,
    '',
    `Time left: <b>${escapeHtml(remainingTimeLabel(topup.expiresAt, now))}</b>`,
    `Expires at ${escapeHtml(when)}.`,
    '',
    `After it is sent, tap <b>I have paid</b> and paste the transaction hash.`,
  ];
  if (reused) {
    lines.push('', 'You already have an open top-up. This is the same one.');
  }
  return lines.join('\n');
}

export function topupClaimText(input: {
  readonly outcome: 'credited' | 'rejected' | 'unavailable' | 'rate_limited';
  readonly reason?: string;
  readonly amountMinor?: bigint;
  readonly newBalance?: bigint;
  readonly confirmations?: number;
  readonly repeated?: boolean;
}): string {
  if (input.outcome === 'rate_limited') {
    return 'Too many payment checks. Wait a few minutes and try the same hash again.';
  }
  if (input.outcome === 'unavailable') {
    return 'Payment checking is temporarily unavailable. Nothing was credited. Try again in a minute.';
  }
  if (input.outcome === 'credited') {
    const amount = input.amountMinor ?? 0n;
    const balance = input.newBalance ?? 0n;
    if (input.repeated) {
      return `This payment is already in your wallet.\n\nBalance: <b>${escapeHtml(formatUsdt(balance))}</b>`;
    }
    return (
      `<b>Payment received</b>\n\n` +
      `Added <b>${escapeHtml(formatUsdt(amount))}</b>\n` +
      `New balance: <b>${escapeHtml(formatUsdt(balance))}</b>`
    );
  }
  const reason = input.reason ?? '';
  if (reason === 'NOT_FOUND') {
    return 'That transaction is not on BNB Smart Chain yet. Wait a minute and send the same hash again.';
  }
  if (reason === 'TOO_FEW_CONFIRMATIONS') {
    const have = input.confirmations ?? 0;
    return `The transfer needs more confirmations. It has ${have} of ${bep20MinConfirmations()} so far. Send the same hash again in a minute.`;
  }
  if (reason === 'WRONG_TOKEN' || reason === 'WRONG_RECIPIENT' || reason === 'NO_TRANSFER') {
    return 'That transaction is not a USDT transfer to this store on BNB Smart Chain (BEP20). Nothing was credited.';
  }
  if (reason === 'AMOUNT_TOO_SMALL') {
    return 'The amount received is below this top-up. Nothing was credited.';
  }
  if (reason === 'ALREADY_USED') {
    return 'That transaction hash was already used. Nothing was credited again.';
  }
  if (reason === 'EXPIRED') {
    return 'This top-up expired. Start a new one from your wallet. Nothing was credited.';
  }
  if (reason === 'TOO_EARLY') {
    return 'That transfer is from before this top-up was created. Nothing was credited.';
  }
  if (reason === 'TX_FAILED') {
    return 'That transaction failed on the chain. Nothing was credited.';
  }
  if (reason === 'INVALID_HASH') {
    return 'Send the transaction hash: 0x followed by 64 letters or numbers.';
  }
  if (reason === 'NO_OPEN_TOPUP') {
    return 'There is no open top-up. Start one from your wallet.';
  }
  return 'The payment could not be confirmed. Nothing was credited.';
}
