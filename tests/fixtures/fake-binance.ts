/**
 * @file tests/fixtures/fake-binance.ts
 *
 * Test fixture that always uses the Binance Pay sandbox client.
 *
 * @module Tests
 */

import { createSandboxBinancePayClient } from '@/integrations/binance/client';

export function createFakeBinancePayClient(): ReturnType<typeof createSandboxBinancePayClient> {
  return createSandboxBinancePayClient();
}
