'use client';

import { motion } from 'framer-motion';
import { type MouseEvent, type ReactNode, useState } from 'react';
import { SPRING } from '@/lib/animations';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

type GlowCardProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly delay?: number;
};

/**
 * Card surface whose highlight follows the pointer.
 */
export function GlowCard({ children, className, delay = 0 }: GlowCardProps): JSX.Element {
  const reduced = usePrefersReducedMotion();
  const [spot, setSpot] = useState({ x: 50, y: 30 });

  function onMove(event: MouseEvent<HTMLDivElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    setSpot({
      x: ((event.clientX - box.left) / box.width) * 100,
      y: ((event.clientY - box.top) / box.height) * 100,
    });
  }

  return (
    <motion.article
      className={`group relative overflow-hidden ${className ?? ''}`}
      onMouseMove={onMove}
      initial={reduced ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING.gentle, delay }}
      whileHover={reduced ? { y: 0 } : { y: -4 }}
      whileTap={reduced ? { scale: 1 } : { scale: 0.98 }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(420px circle at ${spot.x}% ${spot.y}%, rgba(139,92,246,0.18), transparent 42%)`,
        }}
      />
      <div className="relative">{children}</div>
    </motion.article>
  );
}
