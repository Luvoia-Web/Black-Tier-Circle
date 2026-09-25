/**
 * @file components/landing/HowItWorks.tsx
 *
 * Pinned horizontal walkthrough on desktop, stacked steps on small screens.
 */

'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/landing/gsap';

const HowItWorksScene = dynamic(() => import('@/components/landing/HowItWorksScene'), {
  ssr: false,
});

const STEPS = [
  {
    index: '01',
    title: 'Connect',
    body: 'Create a bot on Telegram. Paste your token. Your store is live.',
  },
  {
    index: '02',
    title: 'Add Products',
    body: 'Upload your products once. Set your prices. All resellers sell them automatically.',
  },
  {
    index: '03',
    title: 'Earn',
    body: 'Customers pay via USDT or Binance Pay. Funds hit your wallet instantly.',
  },
] as const;

export function HowItWorks(): JSX.Element {
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef(0);

  useGSAP(
    () => {
      const root = rootRef.current;
      const track = trackRef.current;
      const viewport = viewportRef.current;
      if (!root || !track || !viewport) {
        return undefined;
      }

      const panels = gsap.utils.toArray<HTMLElement>('.how-panel', root);
      panels.forEach((panel, index) => {
        ScrollTrigger.create({
          trigger: panel,
          start: 'top 65%',
          end: 'bottom 45%',
          onToggle: (self) => {
            if (self.isActive) {
              stepRef.current = index;
            }
          },
        });
      });

      const media = gsap.matchMedia();
      media.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
        const tween = gsap.to(track, {
          x: () => -(track.scrollWidth - viewport.clientWidth),
          ease: 'none',
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            end: () => `+=${track.scrollWidth}`,
            pin: true,
            scrub: 0.8,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              stepRef.current = self.progress * (STEPS.length - 1);
            },
          },
        });
        return () => tween.kill();
      });

      return () => media.revert();
    },
    { scope: rootRef },
  );

  return (
    <section className="how" id="how" ref={rootRef}>
      <div className="how-layout">
        <div className="how-visual">
          <p className="eyebrow">Three moves</p>
          <h2>How it works</h2>
          <HowItWorksScene stepRef={stepRef} />
        </div>
        <div className="how-viewport" ref={viewportRef}>
          <div className="how-track" ref={trackRef}>
            {STEPS.map((step) => (
              <article className="how-panel" key={step.index}>
                <span>{step.index}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
