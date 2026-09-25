/**
 * @file components/landing/TrustShapes.tsx
 *
 * Low-poly gold solids drifting behind the trust pillars.
 */

'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { readLandingQuality } from '@/components/landing/quality';
import { addStudioLights, createStage } from '@/components/landing/webgl-stage';

export default function TrustShapes(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const quality = readLandingQuality();
    const stage = createStage(host, { dpr: quality.mobile ? 1.25 : 1.5, fov: 42, z: 7 });
    addStudioLights(stage.scene, false);

    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.7, 0),
      new THREE.MeshStandardMaterial({ color: '#e6c98a', metalness: 0.85, roughness: 0.25, wireframe: true }),
    );
    wire.position.set(-2.4, 0.4, 0);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.85, 0),
      new THREE.MeshStandardMaterial({ color: '#d4b483', metalness: 1, roughness: 0.18, emissive: '#a16207', emissiveIntensity: 0.25 }),
    );
    gem.position.set(2.2, -0.3, -0.4);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.05, 12, 40),
      new THREE.MeshStandardMaterial({ color: '#fafaf9', metalness: 0.7, roughness: 0.3 }),
    );
    ring.position.set(0.2, 1.1, -1);
    stage.scene.add(wire, gem, ring);

    let visible = true;
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
    }, { rootMargin: '120px' });
    observer.observe(host);

    const stop = stage.start((delta) => {
      if (!visible) {
        return;
      }
      wire.rotation.y += delta * 0.25;
      wire.position.y = 0.4 + Math.sin(wire.rotation.y) * 0.15;
      gem.rotation.x += delta * 0.2;
      gem.rotation.y += delta * 0.35;
      ring.rotation.z += delta * 0.3;
    });

    return () => {
      observer.disconnect();
      [wire, gem, ring].forEach((mesh) => {
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        }
      });
      stop();
    };
  }, []);

  return <div ref={hostRef} className="scene-slot trust-shapes" aria-hidden="true" />;
}
