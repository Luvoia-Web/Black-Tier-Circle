import { describe, expect, it } from 'vitest';
import { legacyDestination } from '@/lib/legacy-redirects';

const MOVED: ReadonlyArray<readonly [string, string]> = [
  ['/owner', '/overview'],
  ['/reseller', '/overview'],
  ['/owner/products', '/catalog'],
  ['/owner/products/new', '/catalog?create=1'],
  ['/owner/products/prod-1', '/catalog?item=prod-1'],
  ['/owner/products/prod-1/edit', '/catalog?item=prod-1'],
  ['/owner/supplier', '/catalog?section=suppliers'],
  ['/owner/supplier/connect', '/catalog?section=suppliers&connect=1'],
  ['/owner/supplier/sup-1', '/catalog?section=suppliers&supplier=sup-1'],
  ['/owner/supplier/sup-1/settings', '/catalog?section=suppliers&supplier=sup-1'],
  ['/reseller/products', '/catalog'],
  ['/owner/orders', '/orders'],
  ['/owner/orders/ord-1', '/orders?order=ord-1'],
  ['/owner/fulfillment', '/orders?attention=fulfillment'],
  ['/owner/supplier/orders', '/catalog?section=suppliers&panel=orders'],
  ['/owner/supplier/orders/ord-2', '/orders?order=ord-2'],
  ['/reseller/orders', '/orders'],
  ['/reseller/orders/ord-3', '/orders?order=ord-3'],
  ['/reseller/deliveries', '/orders?attention=delivery'],
  ['/owner/payments', '/payments'],
  ['/owner/payments/ord-4', '/orders?order=ord-4'],
  ['/owner/wallets', '/wallets'],
  ['/owner/wallets/wal-1', '/wallets?wallet=wal-1'],
  ['/owner/tokens', '/wallets?section=tokens'],
  ['/reseller/deposits', '/wallets'],
  ['/reseller/wallet', '/wallets'],
  ['/reseller/wallet/history', '/wallets?section=ledger'],
  ['/reseller/bills', '/wallets?section=debts'],
  ['/reseller/payments', '/payments'],
  ['/owner/resellers', '/resellers'],
  ['/owner/resellers/invite', '/resellers'],
  ['/reseller/customers', '/customers'],
  ['/owner/bots', '/bots'],
  ['/owner/bot-studio', '/bot-studio'],
  ['/owner/launch', '/system-health'],
  ['/reseller/bot', '/bots'],
  ['/reseller/bot-studio', '/bot-studio'],
  ['/owner/growth', '/marketing'],
  ['/reseller/growth', '/marketing'],
  ['/owner/settings', '/settings'],
  ['/reseller/settings', '/settings?section=reseller-store'],
  ['/reseller/account', '/settings?section=account'],
  ['/reseller/settings/api-keys', '/settings?section=keys'],
  ['/reseller/settings/webhooks', '/settings?section=webhooks'],
  ['/owner/intelligence', '/intelligence'],
  ['/reseller/intelligence', '/overview'],
  ['/owner/assistant', '/remy'],
  ['/reseller/assistant', '/remy'],
  ['/owner/notifications', '/overview'],
  ['/reseller/notifications', '/overview'],
];

describe('legacy dashboard redirects', () => {
  it('sends every old page directly to its rebuilt home', () => {
    expect(MOVED).toHaveLength(50);
    for (const [from, to] of MOVED) {
      expect(legacyDestination(from), from).toBe(to);
    }
  });

  it('leaves the new areas and the API alone', () => {
    expect(legacyDestination('/overview')).toBeNull();
    expect(legacyDestination('/api/owner/orders')).toBeNull();
    expect(legacyDestination('/catalog')).toBeNull();
  });
});
