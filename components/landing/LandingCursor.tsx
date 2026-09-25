/**
 * @file components/landing/LandingCursor.tsx
 *
 * Difference-blend cursor for fine pointers. Touch devices keep the system cursor.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from '@/lib/landing/gsap';

export function LandingCursor(): JSX.Element | null {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) {
      return undefined;
    }
    setEnabled(true);
    document.documentElement.classList.add('has-landing-cursor');
    const pos = { x: 0, y: 0, cx: 0, cy: 0 };
    const onMove = (event: PointerEvent): void => {
      pos.x = event.clientX;
      pos.y = event.clientY;
    };
    window.addEventListener('pointermove', onMove);
    const tick = (): void => {
      pos.cx += (pos.x - pos.cx) * 0.18;
      pos.cy += (pos.y - pos.cy) * 0.18;
      if (cursorRef.current) {
        gsap.set(cursorRef.current, { x: pos.cx, y: pos.cy });
      }
    };
    gsap.ticker.add(tick);
    return () => {
      document.documentElement.classList.remove('has-landing-cursor');
      window.removeEventListener('pointermove', onMove);
      gsap.ticker.remove(tick);
    };
  }, []);

  if (!enabled) {
    return null;
  }

  return <div ref={cursorRef} className="landing-cursor" aria-hidden="true" />;
}
