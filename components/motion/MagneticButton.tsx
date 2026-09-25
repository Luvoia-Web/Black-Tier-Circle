'use client';

import { motion, useMotionValue, useSpring } from 'framer-motion';
import Link from 'next/link';
import { type MouseEvent, type ReactNode, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

type MagneticButtonProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly href?: string;
  readonly type?: 'button' | 'submit';
  readonly disabled?: boolean;
  readonly onClick?: () => void;
};

/**
 * Primary control that leans a few pixels toward the pointer.
 */
export function MagneticButton({
  children,
  className,
  href,
  type = 'button',
  disabled = false,
  onClick,
}: MagneticButtonProps): JSX.Element {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 220, damping: 18 });
  const springY = useSpring(y, { stiffness: 220, damping: 18 });

  function onMove(event: MouseEvent<HTMLDivElement>): void {
    if (reduced || disabled || ref.current === null) {
      return;
    }
    const box = ref.current.getBoundingClientRect();
    const pull = 0.18;
    x.set((event.clientX - (box.left + box.width / 2)) * pull);
    y.set((event.clientY - (box.top + box.height / 2)) * pull);
  }

  function reset(): void {
    x.set(0);
    y.set(0);
  }

  const inner = href ? (
    <Link href={href} className={className} onClick={onClick ?? (() => undefined)}>
      {children}
    </Link>
  ) : (
    <button type={type} className={className} disabled={disabled} onClick={onClick ?? (() => undefined)}>
      {children}
    </button>
  );

  if (reduced) {
    return inner;
  }

  return (
    <motion.div
      ref={ref}
      style={{ x: springX, y: springY }}
      onMouseMove={onMove}
      onMouseLeave={reset}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      className="inline-flex"
    >
      {inner}
    </motion.div>
  );
}
