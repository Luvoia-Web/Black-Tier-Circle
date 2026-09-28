/**
 * @file scripts/seed-memory-demo.ts
 *
 * Seeds the MemoryOS demo customer and tenant banks.
 *
 * @module Scripts
 */

import { loadEnvLocal } from './load-env';
import {
  resolveCustomerMemoryBank,
  resolveTenantMemoryBank,
  retainCommerceExperience,
} from '../lib/hindsight';

loadEnvLocal();

type SeedItem = {
  bankId: string;
  documentId: string;
  text: string;
  type: string;
  context: string;
};

async function main(): Promise<void> {
  if (process.env.HINDSIGHT_ENABLED !== 'true' || !process.env.HINDSIGHT_API_KEY) {
    console.error('[memory:seed] Hindsight is not configured');
    process.exit(1);
  }

  const customerBank = resolveCustomerMemoryBank('demo-store-1', 'demo-customer-1');
  const tenantBank = resolveTenantMemoryBank('demo-store-1');

  const items: SeedItem[] = [
    {
      bankId: customerBank,
      documentId: 'demo-customer-preference-usdt',
      text: 'Customer consistently chooses USDT payment and prefers round-number prices',
      type: 'customer_preference',
      context: 'checkout preference',
    },
    {
      bankId: customerBank,
      documentId: 'demo-customer-objection-price',
      text: 'Customer objected to $45 price, purchased after $40 counter-offer in October 2024',
      type: 'objection',
      context: 'pricing objection',
    },
    {
      bankId: customerBank,
      documentId: 'demo-customer-recommendation-premium',
      text: 'Recommended premium tier upgrade — customer converted within 24 hours',
      type: 'recommendation_outcome',
      context: 'premium upgrade',
    },
    {
      bankId: tenantBank,
      documentId: 'demo-seller-instruction-discount',
      text: 'Offer 10% discount to returning customers who mention price sensitivity',
      type: 'seller_instruction',
      context: 'seller policy',
    },
    {
      bankId: tenantBank,
      documentId: 'demo-fulfillment-failure-supplier',
      text: 'Supplier API outage November 2024 — recovery: switched to backup supplier in 2 hours',
      type: 'fulfillment_failure',
      context: 'fulfillment recovery',
    },
  ];

  for (const item of items) {
    const ok = await retainCommerceExperience(item.bankId, item.documentId, item.text, item.type, item.context);
    if (!ok) {
      console.error(`[memory:seed] failed to retain ${item.documentId}`);
      process.exit(1);
    }
    console.info(`[memory:seed] retained ${item.type} ${item.documentId}`);
  }

  console.info('[memory:seed] done');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'seed failed';
  console.error(`[memory:seed] ${message}`);
  process.exit(1);
});
