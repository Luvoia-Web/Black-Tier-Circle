'use client';

/**
 * Legacy Growth view wrapper delegating to the dedicated Marketing, Discounts, or Broadcasts page.
 */

import { BroadcastsView } from '@/app/(platform)/broadcasts/view';
import { DiscountsView } from '@/app/(platform)/discounts/view';
import { MarketingView } from '@/app/(platform)/marketing/view';

export function GrowthView({
  focus = 'marketing',
}: {
  readonly focus?: 'all' | 'marketing' | 'discounts' | 'broadcasts';
} = {}): JSX.Element {
  if (focus === 'discounts') return <DiscountsView />;
  if (focus === 'broadcasts') return <BroadcastsView />;
  return <MarketingView />;
}
