import { describe, expect, it } from 'vitest';
import { legacyDestination } from '@/lib/legacy-redirects';

const MOVED: ReadonlyArray<readonly [string, string]> = [
  ['/owner', '/today'],
  ['/reseller', '/today'],
  ['/owner/products', '/catalog'],
  ['/owner/products/new', '/catalog?create=1'],
  ['/owner/products/prod-1', '/catalog?item=prod-1'],
  ['/owner/products/prod-1/edit', '/catalog?item=prod-1'],
  ['/owner/supplier', '/catalog'],
  ['/owner/supplier/connect', '/catalog?connect=1'],
  ['/owner/supplier/sup-1', '/catalog?supplier=sup-1'],
  ['/owner/supplier/sup-1/settings', '/catalog?supplier=sup-1'],
  ['/reseller/products', '/catalog'],
  ['/owner/orders', '/orders'],
  ['/owner/orders/ord-1', '/orders?order=ord-1'],
  ['/owner/fulfillment', '/orders?attention=fulfillment'],
  ['/owner/supplier/orders', '/orders'],
  ['/owner/supplier/orders/ord-2', '/orders?order=ord-2'],
  ['/reseller/orders', '/orders'],
  ['/reseller/orders/ord-3', '/orders?order=ord-3'],
  ['/reseller/deliveries', '/orders?attention=delivery'],
  ['/owner/payments', '/money'],
  ['/owner/payments/ord-4', '/orders?order=ord-4'],
  ['/owner/wallets', '/money'],
  ['/owner/wallets/wal-1', '/money?wallet=wal-1'],
  ['/owner/tokens', '/money?section=tokens'],
  ['/reseller/deposits', '/money'],
  ['/reseller/wallet', '/money'],
  ['/reseller/wallet/history', '/money?section=ledger'],
  ['/reseller/bills', '/money?section=debts'],
  ['/reseller/payments', '/money?section=topups'],
  ['/owner/resellers', '/people?type=reseller'],
  ['/owner/resellers/invite', '/people?invite=1'],
  ['/reseller/customers', '/people?type=buyer'],
  ['/owner/bots', '/store'],
  ['/owner/bot-studio', '/store'],
  ['/owner/launch', '/store?section=health'],
  ['/reseller/bot', '/store'],
  ['/reseller/bot-studio', '/store'],
  ['/owner/growth', '/growth'],
  ['/reseller/growth', '/growth'],
  ['/owner/settings', '/settings'],
  ['/reseller/settings', '/settings'],
  ['/reseller/account', '/settings?section=account'],
  ['/reseller/settings/api-keys', '/settings?section=api-keys'],
  ['/reseller/settings/webhooks', '/settings?section=webhooks'],
  ['/owner/intelligence', '/today'],
  ['/reseller/intelligence', '/today'],
  ['/owner/assistant', '/today'],
  ['/reseller/assistant', '/today'],
  ['/owner/notifications', '/today'],
  ['/reseller/notifications', '/today'],
];

describe('legacy dashboard redirects', () => {
  it('sends every old page to its new home', () => {
    expect(MOVED).toHaveLength(50);
    for (const [from, to] of MOVED) {
      expect(legacyDestination(from), from).toBe(to);
    }
  });

  it('leaves the new areas and the API alone', () => {
    expect(legacyDestination('/today')).toBeNull();
    expect(legacyDestination('/api/owner/orders')).toBeNull();
    expect(legacyDestination('/catalog')).toBeNull();
  });
});
