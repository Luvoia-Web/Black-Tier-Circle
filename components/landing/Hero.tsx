/**
 * @file components/landing/Hero.tsx
 *
 * Opening viewport. Copy is in the document immediately; the crystal loads after.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ROUTES } from '@/lib/navigation';
import { gsap, useGSAP } from '@/lib/landing/gsap';
import { MagneticButton } from '@/components/landing/MagneticButton';
import { WebGLFallback } from '@/components/landing/WebGLFallback';
import { supportsWebGL } from '@/components/landing/quality';
import { useThemeDark } from '@/components/landing/useThemeDark';

const HeroScene = dynamic(() => import('@/components/landing/HeroScene'), {
  ssr: false,
  loading: () => <WebGLFallback />,
});

function SplitLine({ text }: { readonly text: string }): JSX.Element {
  return (
    <span className="split-line">
      {Array.from(text).map((char, index) => (
        <span className="char-mask" key={`${char}-${index}`} aria-hidden="true">
          <span className="hero-char">{char === ' ' ? '\u00A0' : char}</span>
        </span>
      ))}
    </span>
  );
}

export function Hero(): JSX.Element {
  const sectionRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const intensityRef = useRef(0);
  const themeDark = useThemeDark();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    setWebgl(supportsWebGL());
  }, []);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) {
        gsap.from('.hero-char', {
          yPercent: 110,
          opacity: 0,
          duration: 1.05,
          ease: 'power4.out',
          stagger: 0.018,
        });
        gsap.from('.hero-fade', {
          y: 28,
          opacity: 0,
          duration: 0.9,
          ease: 'power3.out',
          stagger: 0.08,
          delay: 0.55,
        });
      }
      ScrollTriggerSafe();
    },
    { scope: sectionRef },
  );

  function ScrollTriggerSafe(): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.to('.hero-copy', {
      yPercent: reduced ? 0 : 18,
      opacity: reduced ? 1 : 0.15,
      ease: 'none',
      scrollTrigger: {
        trigger: sectionRef.current,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
        onUpdate: (self) => {
          progressRef.current = self.progress;
          const show = self.progress <= 0.04;
          setHint((current) => (current === show ? current : show));
        },
      },
    });
  }

  return (
    <section className="hero" ref={sectionRef} id="top">
      <div className="hero-sticky">
        <div className="hero-glow" />
        {webgl ? (
          <HeroScene variant="hero" progressRef={progressRef} intensityRef={intensityRef} themeDark={themeDark} />
        ) : (
          <WebGLFallback />
        )}
        <div className="hero-copy">
          <p className="eyebrow hero-fade">Telegram commerce, non-custodial</p>
          <h1 aria-label="Your Telegram store, live in minutes.">
            <SplitLine text="Your Telegram store," />
            <span className="hero-italic">
              <SplitLine text="live in minutes." />
            </span>
          </h1>
          <p className="lede hero-fade">
            Connect your bot. Add products. Start selling. Black Tier Circle handles everything else.
          </p>
          <div className="hero-actions hero-fade">
            <MagneticButton href={ROUTES.login}>Start Selling →</MagneticButton>
            <MagneticButton href={ROUTES.login} variant="ghost">
              See How It Works
            </MagneticButton>
          </div>
        </div>
        <div className={`scroll-hint ${hint ? '' : 'is-gone'}`} aria-hidden="true">
          <span>Scroll</span>
          <i />
        </div>
      </div>
    </section>
  );
}
