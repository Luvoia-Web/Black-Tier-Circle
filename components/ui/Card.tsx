/**
 * @file components/ui/Card.tsx
 *
 * Raised surface used for dashboard panels and form groups.
 *
 * @module Components
 */

import type { ReactNode } from 'react';

type CardProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly padding?: string;
  readonly hover?: boolean;
};

/**
 * Renders a token-styled card surface.
 *
 * @param props - Content, optional padding, hover, and extra classes
 */
export function Card({
  children,
  className = '',
  padding = 'p-5',
  hover = false,
}: CardProps): JSX.Element {
  const hoverClass = hover ? 'hover:bg-[var(--bg-raised)]' : '';
  return (
    <div
      className={`rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] ${padding} ${hoverClass} ${className}`}
    >
      {children}
    </div>
  );
}

export default Card;
