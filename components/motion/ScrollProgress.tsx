'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

/**
 * Thin violet bar under the top bar that tracks page scroll.
 */
export function ScrollProgress(): JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const bar = barRef.current;
    if (bar === null) {
      return;
    }
    let frame = 0;
    const scroller = bar.closest('main, [data-scroll-root]') ?? document.documentElement;
    const update = (): void => {
      const node = scroller === document.documentElement ? document.documentElement : (scroller as HTMLElement);
      const scrollable = node.scrollHeight - (node === document.documentElement ? window.innerHeight : node.clientHeight);
      const top = node === document.documentElement ? window.scrollY : node.scrollTop;
      const progress = scrollable <= 0 ? 0 : top / scrollable;
      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
    };
    const onScroll = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const target = scroller === document.documentElement ? window : scroller;
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced]);

  return (
    <div className="pointer-events-none sticky top-0 z-30 h-0.5 w-full" aria-hidden="true">
      <div
        ref={barRef}
        className="h-full origin-left bg-gradient-to-r from-[var(--accent)] to-[var(--accent-soft)]"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );
}
