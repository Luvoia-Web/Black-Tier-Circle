'use client';

import { LottiePlayer } from '@/components/motion/LottiePlayer';

type LoadingSpinnerProps = {
  readonly size?: 'sm' | 'md' | 'lg';
};

const SIZE = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-12 w-12' };

/**
 * Looping Lottie spinner for buttons and panels.
 */
export function LoadingSpinner({ size = 'md' }: LoadingSpinnerProps): JSX.Element {
  return <LottiePlayer name="loading-spinner" className={SIZE[size]} />;
}
