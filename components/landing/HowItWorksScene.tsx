/**
 * @file components/landing/HowItWorksScene.tsx
 *
 * Link, product slab, and coin. Scroll progress crossfades them.
 */

'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { readLandingQuality } from '@/components/landing/quality';
import { addStudioLights, createStage } from '@/components/landing/webgl-stage';

type HowItWorksSceneProps = {
  readonly stepRef: React.MutableRefObject<number>;
};

function weightFor(step: number, index: number): number {
  return THREE.MathUtils.clamp(1 - Math.abs(step - index), 0, 1);
}

export default function HowItWorksScene({ stepRef }: HowItWorksSceneProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const stepLive = useRef(stepRef);
  stepLive.current = stepRef;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const quality = readLandingQuality();
    const stage = createStage(host, { dpr: quality.dpr, fov: 38, z: 4.2 });
    addStudioLights(stage.scene, false);

    const gold = new THREE.MeshStandardMaterial({
      color: '#e6c98a',
      metalness: 0.9,
      roughness: 0.2,
      emissive: '#a16207',
      emissiveIntensity: 0.35,
    });
    const ink = new THREE.MeshStandardMaterial({
      color: '#1c1917',
      metalness: 0.55,
      roughness: 0.32,
      emissive: '#a16207',
      emissiveIntensity: 0.18,
    });
    const coinMat = new THREE.MeshStandardMaterial({
      color: '#d4b483',
      metalness: 1,
      roughness: 0.18,
      emissive: '#a16207',
      emissiveIntensity: 0.4,
    });

    const connect = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 24, 80), gold);
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), new THREE.MeshStandardMaterial({ color: '#fafaf9', metalness: 0.4, roughness: 0.25 }));
    node.position.set(0.95, 0.15, 0);
    connect.add(torus, node);

    const product = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.9, 0.12), ink);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 0.55),
      new THREE.MeshBasicMaterial({ color: '#e6c98a', toneMapped: false }),
    );
    label.position.set(0, 0.35, 0.08);
    product.add(slab, label);
    product.scale.setScalar(0.001);

    const earn = new THREE.Group();
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 48), coinMat);
    coin.rotation.x = Math.PI / 2.2;
    const coinRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.03, 12, 48),
      new THREE.MeshBasicMaterial({ color: '#fff6e4', toneMapped: false }),
    );
    earn.add(coin, coinRing);
    earn.scale.setScalar(0.001);

    stage.scene.add(connect, product, earn);
    const groups = [connect, product, earn];
    const geometries = [torus.geometry, node.geometry, slab.geometry, label.geometry, coin.geometry, coinRing.geometry];
    const materials = [gold, ink, coinMat, node.material, label.material, coinRing.material];

    let visible = true;
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
    }, { rootMargin: '160px' });
    observer.observe(host);

    const stop = stage.start((delta, elapsed) => {
      if (!visible) {
        return;
      }
      const step = stepLive.current.current;
      groups.forEach((group, index) => {
        const weight = weightFor(step, index);
        const next = Math.max(weight, 0.001);
        const scale = THREE.MathUtils.damp(group.scale.x, next, 5, delta);
        group.scale.setScalar(scale);
        group.visible = scale > 0.05;
        group.rotation.y += delta * (0.25 + weight * 0.35);
        group.position.y = Math.sin(elapsed * (1.1 + index * 0.2)) * 0.08 * weight;
      });
    });

    return () => {
      observer.disconnect();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => {
        if (material instanceof THREE.Material) {
          material.dispose();
        }
      });
      stop();
    };
  }, []);

  return <div ref={hostRef} className="scene-slot" aria-hidden="true" />;
}
