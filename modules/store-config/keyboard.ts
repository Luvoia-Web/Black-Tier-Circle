import type { ButtonKey, StoreConfig } from '@/modules/store-config/types';
import { COMING_SOON_BUTTONS } from '@/modules/store-config/types';
import { normalizeBotUrl } from '@/modules/store-config/urls';

export type HomeButton = {
  readonly text: string;
  readonly width: 'full' | 'half';
} & ({ readonly kind: 'callback'; readonly data: string } | { readonly kind: 'url'; readonly url: string });

const CALLBACKS: Partial<Record<ButtonKey, string>> = {
  shop: 'shop:',
  freebies: 'freebies:',
  deposit: 'deposit:',
  profile: 'profile:',
  support: 'support:',
  referrals: 'refer:',
  terms: 'terms:',
  reseller_signup: 'reseller_signup:',
  api: 'api_info:',
};

export function layoutHomeButtons(
  config: StoreConfig,
  options: { readonly resellerSignupEnabled: boolean },
): HomeButton[][] {
  const ordered = (Object.keys(config.buttons) as ButtonKey[])
    .filter((key) => !COMING_SOON_BUTTONS.has(key))
    .filter((key) => key !== 'referrals' || config.referrals.enabled)
    .filter((key) => key !== 'freebies' || config.referrals.freebiesEnabled)
    .filter((key) => config.buttons[key].enabled)
    .filter((key) => key !== 'reseller_signup' || options.resellerSignupEnabled)
    .filter((key) => CALLBACKS[key] !== undefined)
    .sort((left, right) => config.buttons[left].order - config.buttons[right].order);
  const buttons: HomeButton[] = ordered.map((key) => {
    const button = config.buttons[key];
    const text = `${button.emoji} ${button.label}`.trim();
    return {
      kind: 'callback',
      text,
      width: button.width,
      data: CALLBACKS[key] ?? 'home:',
    };
  });
  for (const link of config.customLinks) {
    buttons.push({
      kind: 'url',
      text: `${link.emoji} ${link.label}`.trim(),
      width: 'full',
      url: normalizeBotUrl(link.url),
    });
  }
  const rows: HomeButton[][] = [];
  let half: HomeButton | null = null;
  for (const button of buttons) {
    if (button.width === 'full') {
      if (half) {
        rows.push([half]);
        half = null;
      }
      rows.push([button]);
      continue;
    }
    if (half) {
      rows.push([half, button]);
      half = null;
    } else {
      half = button;
    }
  }
  if (half) {
    rows.push([half]);
  }
  return rows;
}
