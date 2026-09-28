/**
 * Lenis smooth scroll locked to the GSAP ticker.
 */

'use client';

import Lenis from 'lenis';
import { gsap, ScrollTrigger } from '@/lib/landing/gsap';
import { crystal, landingReducedMotion } from '@/lib/landing/crystal-state';

let lenis: Lenis | null = null;
let tick: ((time: number) => void) | null = null;

export function setLandingScrollLocked(locked: boolean): void {
  document.documentElement.classList.toggle('mem-lock', locked);
  if (!lenis) {
    return;
  }
  if (locked) {
    lenis.stop();
  } else {
    lenis.start();
  }
}

export function startLandingScroll(): () => void {
  if (landingReducedMotion()) {
    return () => undefined;
  }
  if (lenis) {
    return stopLandingScroll;
  }

  lenis = new Lenis({
    autoRaf: false,
    duration: 1.1,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });

  lenis.on('scroll', (instance) => {
    ScrollTrigger.update();
    const velocity = Math.min(1, Math.abs(instance.velocity) / 2.4);
    crystal.velocity += (velocity - crystal.velocity) * 0.45;
  });

  tick = (time: number) => {
    lenis?.raf(time * 1000);
  };
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  if (document.documentElement.classList.contains('mem-lock')) {
    lenis.stop();
  }

  return stopLandingScroll;
}

function stopLandingScroll(): void {
  if (tick) {
    gsap.ticker.remove(tick);
    tick = null;
  }
  lenis?.destroy();
  lenis = null;
}
