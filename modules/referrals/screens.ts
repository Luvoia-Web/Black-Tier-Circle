import { formatUsdt } from '@/lib/money';
import { isReferralCode } from '@/modules/referrals/codes';
import { escapeHtml, sanitizeBotHtml } from '@/modules/store-config/sanitize';
import { renderTemplate } from '@/modules/store-config/template';

export type FreebieLine = {
  readonly id: string;
  readonly title: string;
  readonly required: number;
  readonly unlocked: boolean;
};

function lines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

function displayName(value: string | null | undefined): string {
  return (value ?? '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 40);
}

export function referralLink(username: string, code: string): string | null {
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username) || !isReferralCode(code)) {
    return null;
  }
  return `https://t.me/${username}?start=ref_${code}`;
}

export function shareUrl(link: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join me on this store')}`;
}

export function referralHomeText(input: {
  readonly template: string;
  readonly link: string | null;
  readonly invited: number;
  readonly pending: number;
  readonly qualified: number;
  readonly points: number;
  readonly walletMinor: bigint;
  readonly nextLine: string | null;
}): string {
  const intro = renderTemplate(input.template, {});
  const linkLine = input.link ? `<code>${escapeHtml(input.link)}</code>` : 'Your link will appear when the bot username is set.';
  const parts = [
    intro,
    linkLine,
    `Invited: ${input.invited}`,
    `Pending: ${input.pending}`,
    `Qualified: ${input.qualified}`,
    `Points: ${input.points}`,
    `Wallet value: ${formatUsdt(input.walletMinor)}`,
  ];
  if (input.nextLine) {
    parts.push(input.nextLine);
  }
  return lines(parts.join('\n'));
}

export function nextFreebieLine(qualified: number, freebies: readonly FreebieLine[]): string | null {
  const next = freebies
    .filter((item) => item.required > qualified)
    .sort((left, right) => left.required - right.required)[0];
  if (!next) {
    return null;
  }
  const remaining = next.required - qualified;
  return `${remaining} more qualified friend${remaining === 1 ? '' : 's'} to unlock ${escapeHtml(next.title)}`;
}

export function friendJoinedText(template: string, firstName: string | null | undefined): string {
  const name = displayName(firstName);
  if (!name) {
    return 'A friend joined.';
  }
  return lines(renderTemplate(template, { name }));
}

export function qualifiedText(template: string, points: number): string {
  return lines(renderTemplate(template, { points: String(points) }));
}

export function redeemConfirmText(points: number, amountMinor: bigint): string {
  return lines(`Redeem ${points} points for ${formatUsdt(amountMinor)}?`);
}

export function redeemedText(template: string, points: number, amountMinor: bigint): string {
  return lines(renderTemplate(template, { points: String(points), amount: formatUsdt(amountMinor) }));
}

export function freebieListText(template: string, items: readonly FreebieLine[]): string {
  const intro = renderTemplate(template, {});
  if (items.length === 0) {
    return lines(`${intro}\nNo freebies yet.`);
  }
  const body = items
    .map((item) => `${item.unlocked ? 'Unlocked' : 'Locked'} — ${item.required} referrals — ${escapeHtml(item.title)}`)
    .join('\n');
  return lines(`${intro}\n${body}`);
}

export function freebieContentText(title: string, kind: 'text' | 'link', content: string): string {
  const heading = `<b>${escapeHtml(displayName(title) || 'Freebie')}</b>`;
  const trimmed = content.trim();
  if (kind === 'link' && /^https:\/\//i.test(trimmed)) {
    return lines(`${heading}\n${trimmed}`);
  }
  return lines(`${heading}\n${sanitizeBotHtml(trimmed)}`);
}
