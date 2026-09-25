'use client';

import { useEffect, useState } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

type AnimatedCounterProps = {
  readonly value: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly decimals?: number;
  readonly className?: string;
};

/**
 * Springs a number from zero up to `value`.
 */
export function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
}: AnimatedCounterProps): JSX.Element {
  const reduced = usePrefersReducedMotion();
  const motionValue = useMotionValue(reduced ? value : 0);
  const spring = useSpring(motionValue, { stiffness: 70, damping: 18, mass: 0.8 });
  const [text, setText] = useState(() => formatCount(reduced ? value : 0, prefix, suffix, decimals));

  useEffect(() => {
    if (reduced) {
      setText(formatCount(value, prefix, suffix, decimals));
      return;
    }
    motionValue.set(value);
    const unsubscribe = spring.on('change', (latest) => {
      setText(formatCount(latest, prefix, suffix, decimals));
    });
    return () => unsubscribe();
  }, [decimals, motionValue, prefix, reduced, spring, suffix, value]);

  return <span className={className}>{text}</span>;
}

function formatCount(latest: number, prefix: string, suffix: string, decimals: number): string {
  return `${prefix}${latest.toFixed(decimals)}${suffix}`;
}
