/**
 * @file scripts/test-memory-isolation.ts
 *
 * Proves customer memories stay inside the tenant bank they were written to.
 *
 * @module Scripts
 */

import { loadEnvLocal } from './load-env';
import {
  recallCustomerExperience,
  resolveCustomerMemoryBank,
  resolvePlatformMemoryBank,
  type MemoryEvidence,
} from '../lib/hindsight';

loadEnvLocal();

const QUERY = 'Customer consistently chooses USDT payment and prefers round-number prices';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function recallSeeded(bankId: string): Promise<MemoryEvidence[]> {
  let last: MemoryEvidence[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    last = await recallCustomerExperience(bankId, QUERY);
    if (last.length > 0) {
      return last;
    }
    if (attempt < 5) {
      await sleep(5000);
    }
  }
  return last;
}

function report(passed: boolean, label: string): boolean {
  console.info(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  return passed;
}

async function main(): Promise<void> {
  if (process.env.HINDSIGHT_ENABLED !== 'true' || !process.env.HINDSIGHT_API_KEY) {
    console.error('[memory:smoke] Hindsight is not configured');
    process.exit(1);
  }

  const seededBank = resolveCustomerMemoryBank('demo-store-1', 'demo-customer-1');
  const otherTenantBank = resolveCustomerMemoryBank('demo-store-2', 'demo-customer-1');
  const platformBank = resolvePlatformMemoryBank();

  const seeded = await recallSeeded(seededBank);
  const isolated = await recallCustomerExperience(otherTenantBank, QUERY);
  const platform = await recallCustomerExperience(platformBank, QUERY);

  const case1 = report(seeded.length > 0, `case 1: demo-store-1 customer bank returned ${seeded.length} memories`);
  const case2 = report(isolated.length === 0, `case 2: demo-store-2 customer bank returned ${isolated.length} memories`);
  const case3 = report(platform.length === 0, `case 3: platform bank returned ${platform.length} memories`);

  if (!case1 || !case2 || !case3) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'smoke test failed';
  console.error(`[memory:smoke] ${message}`);
  process.exit(1);
});
