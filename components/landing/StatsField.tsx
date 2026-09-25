/**
 * @file components/landing/StatsField.tsx
 *
 * Quiet particle bed behind the proof numbers.
 */

'use client';

import { useEffect, useRef } from 'react';
import { readLandingQuality } from '@/components/landing/quality';
import { createStage } from '@/components/landing/webgl-stage';
import { createParticles } from '@/components/landing/ParticleField';
import { landingPointer } from '@/lib/landing/store';

type StatsFieldProps = {
  readonly themeDark: boolean;
};

export default function StatsField({ themeDark }: StatsFieldProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const theme = useRef(themeDark);
  theme.current = themeDark;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const quality = readLandingQuality();
    const stage = createStage(host, { dpr: 1.5, fov: 50, z: 6 });
    const particles = createParticles(stage.scene, quality.mobile ? 180 : 700, themeDark);
    let visible = true;
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
    }, { rootMargin: '120px' });
    observer.observe(host);
    const stop = stage.start((_delta, elapsed) => {
      if (!visible) {
        return;
      }
      particles.update(elapsed, landingPointer, theme.current, stage.renderer.getPixelRatio());
    });
    return () => {
      observer.disconnect();
      particles.dispose();
      stop();
    };
  }, [themeDark]);

  return <div ref={hostRef} className="scene-slot stats-field" aria-hidden="true" />;
}
