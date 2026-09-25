/**
 * @file components/landing/CTASection.tsx
 *
 * Closing shot. The crystal returns, closer, and answers the cursor.
 */

'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import { ROUTES } from '@/lib/navigation';
import { MagneticButton } from '@/components/landing/MagneticButton';
import { WebGLFallback } from '@/components/landing/WebGLFallback';
import { useThemeDark } from '@/components/landing/useThemeDark';
import { supportsWebGL } from '@/components/landing/quality';
import { useEffect, useState } from 'react';

const HeroScene = dynamic(() => import('@/components/landing/HeroScene'), { ssr: false });

export function CTASection(): JSX.Element {
  const progressRef = useRef(0);
  const intensityRef = useRef(0);
  const themeDark = useThemeDark();
  const [webgl, setWebgl] = useState(false);

  useEffect(() => {
    setWebgl(supportsWebGL());
  }, []);

  return (
    <section className="finale" id="create">
      <div className="hero-glow finale-glow" />
      {webgl ? (
        <HeroScene variant="finale" progressRef={progressRef} intensityRef={intensityRef} themeDark={themeDark} />
      ) : (
        <WebGLFallback />
      )}
      <div className="finale-copy">
        <h2>Your Telegram store is waiting.</h2>
        <p>Set up in 30 minutes. Start selling today.</p>
        <MagneticButton
          href={ROUTES.login}
          onHoverChange={(hovered) => {
            intensityRef.current = hovered ? 1 : 0;
          }}
        >
          Create Your Store →
        </MagneticButton>
      </div>
    </section>
  );
}
