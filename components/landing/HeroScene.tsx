/**
 * @file components/landing/HeroScene.tsx
 *
 * Full-viewport crystal for the hero and the closing shot.
 * The camera eases back as scroll progress rises.
 */

'use client';

import { useEffect, useRef } from 'react';
import { landingPointer } from '@/lib/landing/store';
import { readLandingQuality } from '@/components/landing/quality';
import { addStudioLights, createStage, easeCamera } from '@/components/landing/webgl-stage';
import { createCrystal } from '@/components/landing/HeroObject';
import { createParticles } from '@/components/landing/ParticleField';

export type HeroSceneProps = {
  readonly variant: 'hero' | 'finale';
  readonly progressRef: React.MutableRefObject<number>;
  readonly intensityRef: React.MutableRefObject<number>;
  readonly themeDark: boolean;
};

export default function HeroScene(props: HeroSceneProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const quality = readLandingQuality();
    const stage = createStage(host, {
      dpr: quality.dpr,
      fov: 40,
      z: props.variant === 'finale' ? 2.95 : 4.5,
      exposure: props.variant === 'finale' ? 1.15 : 1.05,
    });
    addStudioLights(stage.scene, props.variant === 'finale');
    const crystal = createCrystal(stage.scene, {
      mobile: quality.mobile,
      variant: props.variant,
      themeDark: props.themeDark,
    });
    const particles = createParticles(stage.scene, quality.particles, props.themeDark);

    let visible = true;
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? false;
      },
      { rootMargin: '180px' },
    );
    observer.observe(host);

    const stop = stage.start((delta, elapsed) => {
      if (!visible) {
        return;
      }
      const current = live.current;
      crystal.update(delta, elapsed, current.intensityRef.current, current.themeDark);
      particles.update(elapsed, landingPointer, current.themeDark, stage.renderer.getPixelRatio());
      const pull = current.variant === 'hero' ? current.progressRef.current : 0;
      const nearZ = current.variant === 'finale' ? 2.85 : 4.35;
      const farZ = current.variant === 'finale' ? 3.15 : 7.4;
      easeCamera(stage.camera, delta, {
        x: landingPointer.x * 0.42,
        y: 0.12 + landingPointer.y * 0.28,
        z: nearZ + (farZ - nearZ) * pull,
      });
    });

    return () => {
      observer.disconnect();
      crystal.dispose();
      particles.dispose();
      stop();
    };
  }, [props.variant, props.themeDark]);

  return <div ref={hostRef} className="scene-slot" aria-hidden="true" />;
}
