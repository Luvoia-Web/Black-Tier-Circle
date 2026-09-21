/**
 * @file components/ui/Button.tsx
 *
 * Shared action button with primary, secondary, ghost, and danger variants.
 *
 * @module Components
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly children: ReactNode;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-soft)]',
  secondary:
    'bg-[var(--bg-raised)] border border-[var(--border-soft)] text-[var(--text-1)] hover:border-[var(--accent)]',
  ghost: 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-raised)]',
  danger: 'bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/20 hover:bg-red-500/20',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

/**
 * Renders a themed button. Disables itself while `loading` is true.
 *
 * @param props - Native button props plus variant, size, and loading
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps): JSX.Element {
  const isDisabled = disabled === true || loading;
  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--r-md)] font-medium disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}

export default Button;
