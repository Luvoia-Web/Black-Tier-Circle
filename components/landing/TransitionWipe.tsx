/**
 * @file components/landing/TransitionWipe.tsx
 *
 * Mounts the liquid shader only while the hero seam crosses the viewport.
 */

'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ScrollTrigger, useGSAP } from '@/lib/landing/gsap';

const WipeCanvas = dynamic(() => import('@/components/landing/WipeCanvas'), { ssr: false });

export function TransitionWipe(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [active, setActive] = useState(false);

  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: ref.current,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: (self) => setActive(self.isActive),
        onUpdate: (self) => {
          progressRef.current = self.progress;
        },
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="wipe-sentinel" aria-hidden="true">
      {active ? <WipeCanvas progressRef={progressRef} /> : null}
    </div>
  );
}
