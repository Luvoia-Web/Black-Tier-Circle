/**
 * Full-screen preloader. The crystal assembles underneath, then the veil lifts.
 */

'use client';

import { useEffect, useState } from 'react';
import { gsap } from '@/lib/landing/gsap';
import { crystal, landingReducedMotion } from '@/lib/landing/crystal-state';
import { setLandingScrollLocked } from '@/lib/landing-scroll';

export function MemoryPreloader(): JSX.Element | null {
  const [count, setCount] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (landingReducedMotion()) {
      crystal.progress = 1;
      document.documentElement.classList.add('mem-revealed');
      setGone(true);
      return undefined;
    }

    setLandingScrollLocked(true);
    const proxy = { n: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        setLandingScrollLocked(false);
        setGone(true);
      },
    });
    tl.to(proxy, {
      n: 100,
      duration: 1.5,
      ease: 'power1.inOut',
      onUpdate: () => {
        const value = Math.round(proxy.n);
        setCount(value);
        crystal.progress = (value / 100) * 0.3;
      },
    });
    tl.add(() => {
      document.documentElement.classList.add('mem-revealed');
      window.dispatchEvent(new Event('mem-reveal'));
    });
    tl.to('.mem-preloader', { yPercent: -100, duration: 0.9, ease: 'power3.inOut' });
    tl.to(crystal, { progress: 1, duration: 1.15, ease: 'power2.out' }, '<');

    return () => {
      tl.kill();
      setLandingScrollLocked(false);
    };
  }, []);

  if (gone) return null;

  return (
    <div className="mem-preloader" role="status" aria-live="polite" aria-label="Loading MemoryOS">
      <p className="mem-preloader-kicker">MemoryOS</p>
      <p className="mem-preloader-count">{count}%</p>
    </div>
  );
}
