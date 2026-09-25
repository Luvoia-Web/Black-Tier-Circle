/**
 * @file components/landing/MagneticButton.tsx
 *
 * Spring-followed call to action. Every landing CTA routes to login.
 */

'use client';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

type MagneticButtonProps = {
  readonly href: string;
  readonly children: ReactNode;
  readonly variant?: 'solid' | 'ghost';
  readonly onHoverChange?: (hovered: boolean) => void;
};

export function MagneticButton({
  href,
  children,
  variant = 'solid',
  onHoverChange,
}: MagneticButtonProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const onMove = (event: React.MouseEvent<HTMLDivElement>): void => {
    const node = ref.current;
    if (!node || reduced) {
      return;
    }
    const rect = node.getBoundingClientRect();
    setPos({
      x: (event.clientX - rect.left - rect.width / 2) * 0.35,
      y: (event.clientY - rect.top - rect.height / 2) * 0.35,
    });
  };

  return (
    <motion.div
      ref={ref}
      className="magnetic"
      onMouseMove={onMove}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => {
        setPos({ x: 0, y: 0 });
        onHoverChange?.(false);
      }}
      animate={reduced ? { x: 0, y: 0 } : pos}
      transition={{ type: 'spring', stiffness: 160, damping: 16, mass: 0.4 }}
    >
      <Link href={href} className={variant === 'solid' ? 'btn-solid' : 'btn-ghost'}>
        {children}
      </Link>
    </motion.div>
  );
}
