/**
 * @file components/landing/PlatformPreview.tsx
 *
 * Scroll-yawed product screens. The panels are designed, not screenshots.
 */

'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import { ScrollTrigger, useGSAP } from '@/lib/landing/gsap';

const FloatingMockup = dynamic(() => import('@/components/landing/FloatingMockup'), { ssr: false });

export function PlatformPreview(): JSX.Element {
  const rootRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);

  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: rootRef.current,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
        onUpdate: (self) => {
          progressRef.current = self.progress;
        },
      });
    },
    { scope: rootRef },
  );

  return (
    <section className="section preview" id="preview" ref={rootRef}>
      <div className="section-inner preview-copy">
        <p className="eyebrow">See it working</p>
        <h2>The desk you open every morning.</h2>
        <p className="lede">
          Orders land. Payments clear. The bot answers. Your balance moves — without a spreadsheet in sight.
        </p>
      </div>
      <FloatingMockup progressRef={progressRef} />
    </section>
  );
}
