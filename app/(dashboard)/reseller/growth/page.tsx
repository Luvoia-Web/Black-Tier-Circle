'use client';

import { GrowthPanel } from '@/components/growth/growth-panel';
import { API_ROUTES } from '@/lib/navigation';

export default function ResellerGrowthPage(): JSX.Element {
  return <GrowthPanel base={API_ROUTES.resellerGrowth} />;
}
