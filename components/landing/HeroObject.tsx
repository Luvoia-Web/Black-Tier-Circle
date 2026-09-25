/**
 * @file components/landing/HeroObject.tsx
 *
 * Faceted crystal with the iridescent shader. Disposed by the caller.
 */

import * as THREE from 'three';
import iridescentVert from '@/shaders/iridescent.vert.glsl';
import iridescentFrag from '@/shaders/iridescent.frag.glsl';

export type Crystal = {
  update: (delta: number, elapsed: number, hover: number, themeDark: boolean) => void;
  dispose: () => void;
};

type CrystalOptions = {
  readonly mobile: boolean;
  readonly variant: 'hero' | 'finale';
  readonly themeDark: boolean;
};

export function createCrystal(scene: THREE.Scene, options: CrystalOptions): Crystal {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHover: { value: 0 },
      uTheme: { value: options.themeDark ? 0 : 1 },
    },
    vertexShader: iridescentVert,
    fragmentShader: iridescentFrag,
    transparent: true,
    depthWrite: true,
    toneMapped: false,
  });

  const detail = options.mobile ? 1 : 2;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.28, detail), material);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: '#e6c98a',
    metalness: 1,
    roughness: 0.22,
    emissive: '#a16207',
    emissiveIntensity: options.variant === 'finale' ? 0.85 : 0.45,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.012, 12, options.mobile ? 64 : 140), ringMaterial);
  ring.rotation.set(Math.PI / 2.4, 0.2, 0.4);
  const wire = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.62, 0),
    new THREE.MeshBasicMaterial({ color: '#e6c98a', wireframe: true, transparent: true, opacity: 0.28, toneMapped: false }),
  );

  const group = new THREE.Group();
  group.scale.setScalar(options.variant === 'finale' ? 1.28 : 1);
  group.position.x = options.variant === 'hero' && !options.mobile ? 1.35 : 0;
  group.add(gem, ring, wire);
  scene.add(group);

  let hover = 0;
  return {
    update(delta, elapsed, targetHover, themeDark) {
      hover = THREE.MathUtils.damp(hover, targetHover, 4, delta);
      const time = material.uniforms.uTime;
      const hoverUniform = material.uniforms.uHover;
      const theme = material.uniforms.uTheme;
      if (time) {
        time.value = elapsed;
      }
      if (hoverUniform) {
        hoverUniform.value = hover;
      }
      if (theme) {
        theme.value = themeDark ? 0 : 1;
      }
      const spin = (options.variant === 'finale' ? 0.28 : 0.16) + hover * 1.35;
      gem.rotation.y += delta * spin;
      gem.rotation.x = Math.sin(elapsed * 0.22) * 0.18;
      group.position.y = Math.sin(elapsed * 0.7) * 0.08;
    },
    dispose() {
      scene.remove(group);
      gem.geometry.dispose();
      ring.geometry.dispose();
      wire.geometry.dispose();
      material.dispose();
      ringMaterial.dispose();
      const wireMaterial = wire.material;
      if (wireMaterial instanceof THREE.Material) {
        wireMaterial.dispose();
      }
    },
  };
}
