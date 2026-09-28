/**
 * @file components/landing/LandingShell.tsx
 *
 * Lenis + landing cursor. Dashboard routes never mount this.
 */

'use client';

import { useEffect, type ReactNode } from 'react';
import { startLandingScroll } from '@/lib/landing-scroll';
import { MemoryCursor } from '@/components/landing/MemoryCursor';

type LandingShellProps = {
  readonly children: ReactNode;
};

export function LandingShell({ children }: LandingShellProps): JSX.Element {
  useEffect(() => {
    document.body.classList.add('btc-landing-active');
    const stop = startLandingScroll();
    return () => {
      document.body.classList.remove('btc-landing-active');
      stop();
    };
  }, []);

  return (
    <div className="btc-landing">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <MemoryCursor />
      {children}
    </div>
  );
}
