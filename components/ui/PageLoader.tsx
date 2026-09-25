'use client';

import { LottiePlayer } from '@/components/motion/LottiePlayer';

/**
 * Full-page hold state used while a route segment loads.
 */
export function PageLoader(): JSX.Element {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
      <LottiePlayer name="loading-spinner" className="h-16 w-16" />
      <div className="h-1 w-40 overflow-hidden rounded-full bg-[var(--bg-raised)]">
        <div className="shimmer h-full w-full" />
      </div>
    </div>
  );
}
