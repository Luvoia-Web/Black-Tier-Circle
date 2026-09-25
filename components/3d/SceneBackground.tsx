'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

const PARTICLES = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  left: `${(index * 37) % 100}%`,
  top: `${(index * 53) % 100}%`,
  size: index % 3 === 0 ? 3 : 2,
  duration: 8 + (index % 8),
  delay: (index % 10) * 0.4,
}));

/**
 * Layered ambient background: floating orbs, a faint grid, and particles.
 * Motion uses transform and opacity only.
 */
export function SceneBackground(): JSX.Element {
  const orb1 = useRef<HTMLDivElement>(null);
  const orb2 = useRef<HTMLDivElement>(null);
  const orb3 = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      return;
    }
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      const { default: gsap } = await import('gsap');
      if (cancelled) {
        return;
      }
      const floats: Array<{ el: HTMLDivElement | null; x: number; y: number; duration: number }> = [
        { el: orb1.current, x: 30, y: 20, duration: 8 },
        { el: orb2.current, x: -24, y: -18, duration: 11 },
        { el: orb3.current, x: 16, y: -22, duration: 9 },
      ];
      for (const item of floats) {
        if (item.el === null) {
          continue;
        }
        const tween = gsap.to(item.el, {
          x: item.x,
          y: item.y,
          duration: item.duration,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
        cleanups.push(() => tween.kill());
      }

      const onMove = (event: MouseEvent): void => {
        if (grid.current === null) {
          return;
        }
        const x = (event.clientX / window.innerWidth - 0.5) * 20;
        const y = (event.clientY / window.innerHeight - 0.5) * 20;
        gsap.to(grid.current, { x, y, duration: 1, ease: 'power2.out', overwrite: 'auto' });
      };
      window.addEventListener('mousemove', onMove);
      cleanups.push(() => window.removeEventListener('mousemove', onMove));
    })();

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [reduced]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div
        ref={orb1}
        className="absolute -left-24 -top-24 h-[600px] w-[600px] rounded-full will-change-transform"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.28), transparent 68%)', filter: 'blur(8px)' }}
      />
      <div
        ref={orb2}
        className="absolute -bottom-16 -right-10 h-[400px] w-[400px] rounded-full will-change-transform"
        style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.22), transparent 68%)', filter: 'blur(8px)' }}
      />
      <div
        ref={orb3}
        className="absolute right-[12%] top-1/3 h-[300px] w-[300px] rounded-full will-change-transform"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.12), transparent 70%)', filter: 'blur(10px)' }}
      />
      <div
        ref={grid}
        className="absolute -inset-8 will-change-transform opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      {PARTICLES.map((dot) => (
        <span
          key={dot.id}
          className="particle-dot absolute rounded-full bg-[rgba(139,92,246,0.4)]"
          style={{
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            animationDuration: `${dot.duration}s`,
            animationDelay: `${dot.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
