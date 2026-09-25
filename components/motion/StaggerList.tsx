'use client';

import { motion } from 'framer-motion';
import { Children, type ReactNode } from 'react';
import { FADE_UP } from '@/lib/animations';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

type StaggerListProps = {
  readonly children: ReactNode;
  readonly staggerDelay?: number;
  readonly className?: string;
};

/**
 * Reveals direct children one after another.
 */
export function StaggerList({ children, staggerDelay = 0.07, className }: StaggerListProps): JSX.Element {
  const reduced = usePrefersReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: staggerDelay } } }}
    >
      {Children.map(children, (child, index) => (
        <motion.div key={index} variants={FADE_UP}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
