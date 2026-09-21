/**
 * @file app/(dashboard)/owner/payments/page.tsx
 *
 * Owner payment monitoring dashboard.
 *
 * @module Dashboard
 */

import { getPaymentModeLabel } from '@/lib/payment-config';
import { PaymentsMonitor } from './payments-monitor';

export default function OwnerPaymentsPage(): JSX.Element {
  return <PaymentsMonitor modeLabel={getPaymentModeLabel()} />;
}
