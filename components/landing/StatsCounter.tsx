/**
 * @file components/landing/StatsCounter.tsx
 *
 * Proof figures that count once, when the band enters the viewport.
 */

'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import { gsap, useGSAP } from '@/lib/landing/gsap';
import { useThemeDark } from '@/components/landing/useThemeDark';

const StatsField = dynamic(() => import('@/components/landing/StatsField'), { ssr: false });

const STATS = [
  { value: 120, suffix: '+', label: 'Resellers Active', digits: 0 },
  { value: 18400, suffix: '+', label: 'Orders Processed', digits: 0 },
  { value: 2.4, suffix: 'M+', label: 'USDT in Transactions', digits: 1 },
  { value: 30, suffix: '', label: 'Second Setup Time', digits: 0 },
] as const;

export function StatsCounter(): JSX.Element {
  const rootRef = useRef<HTMLElement>(null);
  const themeDark = useThemeDark();

  useGSAP(
    () => {
      const nodes = gsap.utils.toArray<HTMLElement>('.stat-value', rootRef.current);
      nodes.forEach((node) => {
        const target = Number(node.dataset.value ?? '0');
        const digits = Number(node.dataset.digits ?? '0');
        const suffix = node.dataset.suffix ?? '';
        const proxy = { val: 0 };
        gsap.to(proxy, {
          val: target,
          duration: 1.7,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: rootRef.current,
            start: 'top 75%',
            once: true,
          },
          onUpdate: () => {
            const shown = digits > 0 ? proxy.val.toFixed(digits) : Math.round(proxy.val).toLocaleString('en-IN');
            node.textContent = `${shown}${suffix}`;
          },
        });
      });
    },
    { scope: rootRef },
  );

  return (
    <section className="section stats" id="proof" ref={rootRef}>
      <StatsField themeDark={themeDark} />
      <div className="section-inner stats-grid">
        {STATS.map((stat) => (
          <article key={stat.label}>
            <p
              className="stat-value"
              data-value={stat.value}
              data-suffix={stat.suffix}
              data-digits={stat.digits}
            >
              0{stat.suffix}
            </p>
            <p className="stat-label">{stat.label}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
