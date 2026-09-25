'use client';

import { useEffect, useState } from 'react';
import { useDashboardIdentity } from '@/components/dashboard-identity';
import { CSSOrb } from '@/components/3d/CSSOrb';
import { SplineScene } from '@/components/3d/SplineScene';
import { FadeUp } from '@/components/motion/FadeUp';

const SPLINE_SCENE = 'https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode';

type DashboardHeroProps = {
  readonly subtitle: string;
};

/**
 * Time-aware greeting with a small 3D accent.
 */
export function DashboardHero({ subtitle }: DashboardHeroProps): JSX.Element {
  const { displayName } = useDashboardIdentity();
  const [greeting, setGreeting] = useState('Welcome');
  const name = displayName.trim().length > 0 ? displayName.split(' ')[0] : 'there';

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  return (
    <FadeUp className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-1)]">
            {greeting}, {name}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-2)]">{subtitle}</p>
        </div>
        <SplineScene url={SPLINE_SCENE} fallback={<CSSOrb />} className="hidden h-[120px] w-[160px] sm:block" />
      </div>
    </FadeUp>
  );
}
