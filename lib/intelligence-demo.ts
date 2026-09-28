/**
 * @file lib/intelligence-demo.ts
 *
 * Localhost-only access to the seeded demo memory banks.
 * Production ignores the probe. It cannot select any other tenant.
 *
 * @module Intelligence
 */

export const DEMO_TENANT_ID = 'demo-store-1';
export const DEMO_CUSTOMER_ID = 'demo-customer-1';

export function isLocalDemoProbe(request: Request): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  const host = request.headers.get('host') ?? '';
  const local = host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
  return local && request.headers.get('x-btc-memory-demo') === '1';
}
