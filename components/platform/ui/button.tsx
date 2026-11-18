/**
 * @file components/platform/ui/button.tsx
 *
 * Primary, secondary, and ghost are brand or neutral.
 * Destructive is the only solid crimson fill.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  readonly loading?: boolean;
  readonly children: ReactNode;
};

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-ice text-[var(--base)] hover:opacity-90 active:opacity-80',
  secondary: 'border border-stroke bg-transparent text-ink hover:bg-raised active:bg-plane',
  ghost: 'bg-transparent text-ink-soft hover:bg-raised hover:text-ink active:bg-plane',
  destructive: 'bg-danger text-white hover:opacity-90 active:opacity-80',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps): JSX.Element {
  const off = disabled || loading;
  return (
    <button
      type={type}
      aria-busy={loading}
      disabled={off}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? 'Working…' : children}
    </button>
  );
}
