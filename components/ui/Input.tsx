/**
 * @file components/ui/Input.tsx
 *
 * Text input matching the dashboard design tokens.
 *
 * @module Components
 */

import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Renders a full-width focus-ring input.
 *
 * @param props - Native input attributes
 */
export function Input({ className = '', ...rest }: InputProps): JSX.Element {
  return <input {...rest} className={`btc-input ${className}`} />;
}

export default Input;
