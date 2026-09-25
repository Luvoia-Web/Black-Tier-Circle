'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

type BalanceChartProps = {
  readonly points: ReadonlyArray<number>;
};

/**
 * Draws a balance line from the left when the chart mounts.
 */
export function BalanceChart({ points }: BalanceChartProps): JSX.Element {
  const pathRef = useRef<SVGPathElement>(null);
  const reduced = usePrefersReducedMotion();
  const values = points.length > 1 ? points : [0, ...points];
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const width = 320;
  const height = 96;
  const d = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / span) * (height - 8) - 4;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  useEffect(() => {
    const path = pathRef.current;
    if (path === null) {
      return;
    }
    const length = path.getTotalLength();
    if (reduced) {
      path.style.strokeDasharray = 'none';
      path.style.strokeDashoffset = '0';
      return;
    }
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    let killed = false;
    void import('gsap').then(({ default: gsap }) => {
      if (killed) {
        return;
      }
      gsap.to(path, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.out' });
    });
    return () => {
      killed = true;
    };
  }, [d, reduced]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" role="img" aria-label="Balance over time">
      <path ref={pathRef} d={d} fill="none" stroke="var(--accent-soft)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
