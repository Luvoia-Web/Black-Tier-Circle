/**
 * @file components/landing/WipeCanvas.tsx
 *
 * Full-viewport liquid line between the hero and the problem section.
 */

'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import transitionVert from '@/shaders/transition.vert.glsl';
import transitionFrag from '@/shaders/transition.frag.glsl';

type WipeCanvasProps = {
  readonly progressRef: React.MutableRefObject<number>;
};

export default function WipeCanvas({ progressRef }: WipeCanvasProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const progressLive = useRef(progressRef);
  progressLive.current = progressRef;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: transitionVert,
      fragmentShader: transitionFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const resize = (): void => {
      renderer.setSize(host.clientWidth || 1, host.clientHeight || 1, false);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    let running = true;
    const clock = new THREE.Clock();
    const loop = (): void => {
      if (!running) {
        return;
      }
      const progress = material.uniforms.uProgress;
      const time = material.uniforms.uTime;
      if (progress) {
        progress.value = progressLive.current.current;
      }
      if (time) {
        time.value = clock.getElapsedTime();
      }
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    return () => {
      running = false;
      resizeObserver.disconnect();
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="wipe-canvas" aria-hidden="true" />;
}
