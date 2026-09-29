import { loadEnvLocal } from './load-env';
import {
  resolveCustomerMemoryBank,
  resolveTenantMemoryBank,
  retainCommerceExperience,
} from '../lib/hindsight';

loadEnvLocal();

async function main() {
  if (process.env.HINDSIGHT_ENABLED !== 'true' || !process.env.HINDSIGHT_API_KEY) {
    console.error('Hindsight not configured');
    process.exit(1);
  }

  const TENANT_ID = 'demo-store-001';
  const CUSTOMER_ID = 'demo-customer-001';
  const tenantBank = resolveTenantMemoryBank(TENANT_ID);
  const customerBank = resolveCustomerMemoryBank(TENANT_ID, CUSTOMER_ID);

  console.log('Seeding customer bank:', customerBank);
  const customerSeeds = [
    { documentId: 'cust-pref-001', text: 'Customer prefers premium electronics. Always asks about warranty. Budget ₹2,000–₹15,000.', type: 'customer_preference', context: 'purchase_history' },
    { documentId: 'cust-pref-002', text: 'Customer abandoned cart twice when shipping exceeded ₹100. Offer free shipping to convert.', type: 'customer_preference', context: 'cart_behavior' },
    { documentId: 'cust-pref-003', text: 'Customer bought phone case + screen protector bundle after recommendation. Upsell bundles first.', type: 'purchase_pattern', context: 'conversion' },
    { documentId: 'cust-obj-001', text: 'Customer raised concern about Chinese brand quality. Prefers India warranty. Note for all future recommendations.', type: 'customer_objection', context: 'objection_handling' },
    { documentId: 'cust-conv-001', text: 'Customer converted on boAt Airdopes 141 after seeing 3-month replacement warranty. Price ₹1,299.', type: 'conversion_event', context: 'successful_sale' },
  ];

  for (const s of customerSeeds) {
    try {
      await retainCommerceExperience(customerBank, s.documentId, s.text, s.type as any, s.context);
      console.log('✓ customer:', s.documentId);
    } catch (e) { console.error('✗', s.documentId, (e as Error).message); }
  }

  console.log('\nSeeding tenant bank:', tenantBank);
  const tenantSeeds = [
    { documentId: 'store-pattern-001', text: 'Store peak hours 7–9 PM IST. Late orders get delivery complaints — add disclaimer.', type: 'store_insight', context: 'operations' },
    { documentId: 'store-pattern-002', text: 'Best category: TWS earbuds 42% of revenue. Customers ask about bass quality most.', type: 'learned_pattern', context: 'product_performance' },
    { documentId: 'store-recovery-001', text: '15% discount code within 1 hour of abandonment: 71% recovery rate vs 8% without.', type: 'recovery_insight', context: 'cart_recovery' },
    { documentId: 'store-pattern-003', text: 'Tier 2 city customers prefer COD and need trust signals. Show return policy upfront.', type: 'learned_pattern', context: 'customer_segment' },
    { documentId: 'store-conversion-001', text: 'Video reviews increase conversion 34%. Products with 3+ images convert 2.1x better.', type: 'store_insight', context: 'conversion_optimization' },
  ];

  for (const s of tenantSeeds) {
    try {
      await retainCommerceExperience(tenantBank, s.documentId, s.text, s.type as any, s.context);
      console.log('✓ tenant:', s.documentId);
    } catch (e) { console.error('✗', s.documentId, (e as Error).message); }
  }

  console.log('\n✅ All demo data seeded.');
}

main().catch(console.error);