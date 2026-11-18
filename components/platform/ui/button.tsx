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
  primary: 'btc-btn-primary hover:opacity-90 active:opacity-80',
  secondary: 'h-[38px] min-h-[38px] rounded-xl border border-white/12 bg-white/[0.07] px-[15px] text-[13.5px] font-medium text-ink hover:bg-white/10',
  ghost: 'h-[38px] min-h-[38px] rounded-xl bg-transparent px-3 text-[13.5px] text-ink-soft hover:bg-white/[0.06] hover:text-ink',
  destructive: 'h-[38px] min-h-[38px] rounded-xl border border-[rgb(255_90_95/0.35)] bg-[rgb(255_90_95/0.08)] px-3 text-[13.5px] font-medium text-[#ffb4b6] hover:bg-[rgb(255_90_95/0.14)]',
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
      className={`inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? 'Working…' : children}
    </button>
  );
}
