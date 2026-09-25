/**
 * @file components/landing/LandingShell.tsx
 *
 * Lenis smooth scroll wired to GSAP ScrollTrigger, plus the landing cursor.
 */

'use client';

import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from '@/lib/landing/gsap';
import { landingPointer, lenisRef } from '@/lib/landing/store';
import { LandingCursor } from '@/components/landing/LandingCursor';

type LandingShellProps = {
  readonly children: ReactNode;
};

export function LandingShell({ children }: LandingShellProps): JSX.Element {
  useEffect(() => {
    document.body.classList.add('btc-landing-active');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const onPointer = (event: PointerEvent): void => {
      landingPointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      landingPointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onPointer);

    if (reduced) {
      return () => {
        document.body.classList.remove('btc-landing-active');
        window.removeEventListener('pointermove', onPointer);
      };
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      autoRaf: false,
      anchors: true,
    });
    lenisRef.current = lenis;
    lenis.on('scroll', ScrollTrigger.update);

    const tick = (time: number): void => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const refresh = (): void => {
      ScrollTrigger.refresh();
    };
    document.fonts.ready.then(refresh).catch(() => undefined);

    return () => {
      document.body.classList.remove('btc-landing-active');
      window.removeEventListener('pointermove', onPointer);
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return (
    <div className="btc-landing">
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <LandingCursor />
        {children}
    </div>
  );
}
