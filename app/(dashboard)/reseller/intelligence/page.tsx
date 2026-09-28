/**
 * @file app/(dashboard)/reseller/intelligence/page.tsx
 *
 * Reseller MemoryOS section. Existing dashboard chrome is unchanged.
 *
 * @module Dashboard
 */

import { IntelligenceBoard } from '@/components/intelligence/IntelligenceBoard';
import { requireReseller } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function ResellerIntelligencePage(): Promise<JSX.Element> {
  const session = await requireReseller();
  return <IntelligenceBoard tenantId={session.tenant.id} />;
}
