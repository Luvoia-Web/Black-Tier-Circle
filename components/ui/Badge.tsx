/**
 * @file components/ui/Badge.tsx
 *
 * Pill badge for status and category labels.
 *
 * @module Components
 */

import type { ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
export type BadgeSize = 'sm' | 'md';

type BadgeProps = {
  readonly children: ReactNode;
  readonly variant?: BadgeVariant;
  readonly size?: BadgeSize;
  readonly className?: string;
};

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  success: 'bg-[var(--green-soft)] text-[var(--green)] border-[var(--green)]/20',
  warning: 'bg-[var(--amber-soft)] text-[var(--amber)] border-[var(--amber)]/20',
  danger: 'bg-[var(--red-soft)] text-[var(--red)] border-[var(--red)]/20',
  accent: 'bg-[var(--accent-glow)] text-[var(--accent-soft)] border-[var(--accent)]/20',
  neutral: 'bg-[var(--bg-raised)] text-[var(--text-2)] border-[var(--border-soft)]',
};

/**
 * Renders a compact status pill.
 *
 * @param props - Label, variant, and size
 */
export function Badge({
  children,
  variant = 'neutral',
  size = 'sm',
  className = '',
}: BadgeProps): JSX.Element {
  const sizeClass = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium capitalize ${VARIANT_CLASS[variant]} ${sizeClass} ${className}`}
    >
      {children}
    </span>
  );
}

export default Badge;
