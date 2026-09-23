/**
 * @file app/(dashboard)/owner/payments/page.tsx
 *
 * Owner payment monitoring dashboard.
 *
 * @module Dashboard
 */

import { asDbClient } from '@/lib/auth/session';
import { getPaymentModeLabel, isPlatformPaymentConfigured } from '@/lib/payment-config';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getPlatformSettings } from '@/modules/platform';
import { PaymentsMonitor } from './payments-monitor';

export const metadata = { title: 'Payments' };

export default async function OwnerPaymentsPage(): Promise<JSX.Element> {
  const settings = await getPlatformSettings(asDbClient(createAdminSupabaseClient()));
  return <PaymentsMonitor modeLabel={getPaymentModeLabel(isPlatformPaymentConfigured(settings))} />;
}
