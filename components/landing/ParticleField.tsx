/**
 * @file components/landing/ParticleField.tsx
 *
 * One point cloud. The vertex shader drifts the field and leans it toward the cursor.
 */

import * as THREE from 'three';
import particlesVert from '@/shaders/particles.vert.glsl';
import particlesFrag from '@/shaders/particles.frag.glsl';

export type ParticleCloud = {
  update: (elapsed: number, pointer: { readonly x: number; readonly y: number }, themeDark: boolean, dpr: number) => void;
  dispose: () => void;
};

export function createParticles(scene: THREE.Scene, count: number, themeDark: boolean): ParticleCloud {
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const radius = 2.15 + Math.random() * 3.6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.7;
    positions[i * 3 + 2] = radius * Math.cos(phi);
    scales[i] = 1.1 + Math.random() * 2.6;
    speeds[i] = 0.2 + Math.random() * 0.85;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2() },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uTheme: { value: themeDark ? 0 : 1 },
    },
    vertexShader: particlesVert,
    fragmentShader: particlesFrag,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  return {
    update(elapsed, pointer, dark, dpr) {
      const time = material.uniforms.uTime;
      const mouse = material.uniforms.uMouse;
      const ratio = material.uniforms.uPixelRatio;
      const theme = material.uniforms.uTheme;
      if (time) {
        time.value = elapsed;
      }
      if (mouse && mouse.value instanceof THREE.Vector2) {
        mouse.value.set(pointer.x, pointer.y);
      }
      if (ratio) {
        ratio.value = dpr;
      }
      if (theme) {
        theme.value = dark ? 0 : 1;
      }
    },
    dispose() {
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}
