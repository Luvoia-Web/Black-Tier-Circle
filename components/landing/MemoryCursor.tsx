/**
 * Desktop cursor: 12px electric dot, ring on cards, arrow on links.
 */

'use client';

import { useEffect, useRef } from 'react';

export function MemoryCursor(): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const narrow = window.matchMedia('(max-width: 768px)').matches;
    if (!fine || narrow) return undefined;

    const node = ref.current;
    if (!node) return undefined;
    document.documentElement.classList.add('has-mem-cursor');

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let cx = x;
    let cy = y;
    let frame = 0;

    const onMove = (event: PointerEvent): void => {
      x = event.clientX;
      y = event.clientY;
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest('a, button');
      const card = target?.closest('[data-cursor="hover"]');
      node.classList.toggle('is-link', Boolean(control));
      node.classList.toggle('is-hover', Boolean(card) && !control);
    };

    const loop = (): void => {
      const k = 1 - Math.exp(-1 / 3.6);
      cx += (x - cx) * k;
      cy += (y - cy) * k;
      node.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      frame = window.requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    frame = window.requestAnimationFrame(loop);

    return () => {
      document.documentElement.classList.remove('has-mem-cursor');
      window.removeEventListener('pointermove', onMove);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className="mem-cursor" aria-hidden="true">
      <span className="mem-cursor-arrow">→</span>
    </div>
  );
}
