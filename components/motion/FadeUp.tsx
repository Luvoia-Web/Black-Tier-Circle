'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { SPRING } from '@/lib/animations';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

type FadeUpProps = {
  readonly children: ReactNode;
  readonly delay?: number;
  readonly className?: string;
};

/**
 * Fades a block upward once it mounts.
 */
export function FadeUp({ children, delay = 0, className }: FadeUpProps): JSX.Element {
  const reduced = usePrefersReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING.gentle, delay }}
    >
      {children}
    </motion.div>
  );
}
