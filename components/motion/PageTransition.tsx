'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { PAGE_TRANSITION } from '@/lib/animations';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

type PageTransitionProps = {
  readonly routeKey: string;
  readonly children: ReactNode;
};

/**
 * Crossfades page content when the route key changes.
 */
export function PageTransition({ routeKey, children }: PageTransitionProps): JSX.Element {
  const reduced = usePrefersReducedMotion();
  if (reduced) {
    return <div className="min-w-0">{children}</div>;
  }
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={routeKey}
        className="min-w-0"
        initial={PAGE_TRANSITION.initial}
        animate={PAGE_TRANSITION.animate}
        exit={PAGE_TRANSITION.exit}
        transition={PAGE_TRANSITION.transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
