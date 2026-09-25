/**
 * @file components/landing/ProblemSolution.tsx
 *
 * Broken Telegram selling, then the fix. Cards enter from alternating edges.
 */

'use client';

import { useRef } from 'react';
import { gsap, useGSAP } from '@/lib/landing/gsap';

const PROBLEMS = [
  'Setting up a Telegram bot takes weeks of development',
  'Managing payments manually is a nightmare',
  'Delivering products by hand doesn\u2019t scale',
] as const;

const SOLUTIONS = [
  'Connect your BotFather bot in 30 seconds',
  'USDT payments verified and delivered automatically',
  'Products delivered to customers instantly',
] as const;

const FROM = [
  { x: -72, y: 0 },
  { x: 0, y: 64 },
  { x: 72, y: 0 },
] as const;

export function ProblemSolution(): JSX.Element {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        return;
      }
      gsap.from('.problem-card', {
        x: (index) => FROM[index]?.x ?? 0,
        y: (index) => FROM[index]?.y ?? 40,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.12,
        scrollTrigger: {
          trigger: '.problem-grid',
          start: 'top 78%',
        },
      });
      gsap.from('.solution-card', {
        x: (index) => -(FROM[index]?.x ?? 0),
        y: (index) => FROM[index]?.y ?? 40,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.12,
        scrollTrigger: {
          trigger: '.solution-grid',
          start: 'top 78%',
        },
      });
      gsap.from('.problem-copy', {
        y: 36,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: { trigger: rootRef.current, start: 'top 75%' },
      });
    },
    { scope: rootRef },
  );

  return (
    <section className="section problem" id="problem" ref={rootRef}>
      <div className="section-inner">
        <div className="problem-copy">
          <p className="eyebrow">The break</p>
          <h2>
            Selling on Telegram is broken.
            <span> We fixed it.</span>
          </h2>
        </div>
        <div className="card-grid problem-grid">
          {PROBLEMS.map((item) => (
            <article key={item} className="story-card problem-card">
              <span className="mark-x" aria-hidden="true" />
              <p>{item}</p>
            </article>
          ))}
        </div>
        <div className="card-grid solution-grid">
          {SOLUTIONS.map((item) => (
            <article key={item} className="story-card solution-card">
              <span className="mark-ok" aria-hidden="true" />
              <p>{item}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
