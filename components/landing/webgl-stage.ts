/**
 * @file components/landing/webgl-stage.ts
 *
 * A small WebGL stage for the landing page.
 * React Three Fiber 9 cannot mount here: it requires React 19, and this app is React 18.
 * This stage still caps pixel ratio, drops it if frames slip, and disposes the renderer.
 */

import * as THREE from 'three';

export type Stage = {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  start: (frame: (delta: number, elapsed: number) => void) => () => void;
};

type StageOptions = {
  readonly dpr: number;
  readonly fov: number;
  readonly z: number;
  readonly exposure?: number;
};

export function createStage(host: HTMLElement, options: StageOptions): Stage {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.exposure ?? 1.05;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.dpr));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(options.fov, 1, 0.1, 40);
  camera.position.set(0, 0.12, options.z);

  const resize = (): void => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  return {
    scene,
    camera,
    renderer,
    start(frame) {
      let running = true;
      let frames = 0;
      let slow = 0;
      let dropped = false;
      const clock = new THREE.Clock();
      const loop = (): void => {
        if (!running) {
          return;
        }
        const delta = Math.min(clock.getDelta(), 0.05);
        const elapsed = clock.elapsedTime;
        frames += 1;
        if (delta > 0.028) {
          slow += 1;
        }
        if (!dropped && frames > 80 && slow > 28) {
          dropped = true;
          renderer.setPixelRatio(1);
          resize();
        }
        frame(delta, elapsed);
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      return () => {
        running = false;
        observer.disconnect();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    },
  };
}

export function addStudioLights(scene: THREE.Scene, intense: boolean): void {
  const ambient = new THREE.AmbientLight(0xf6f1e7, 0.45);
  const hemi = new THREE.HemisphereLight(0xf6f1e7, 0x1c1917, 0.7);
  const key = new THREE.DirectionalLight(0xfff8ee, intense ? 4.2 : 2.8);
  key.position.set(4.5, 6.2, 3.4);
  const gold = new THREE.PointLight(0xe8d5a3, intense ? 90 : 48, 16, 2);
  gold.position.set(-3.1, 1.4, 2.2);
  const violet = new THREE.PointLight(0x6d5cff, intense ? 36 : 18, 14, 2);
  violet.position.set(2.6, -1.2, -2.4);
  scene.add(ambient, hemi, key, gold, violet);
}

const lookAt = new THREE.Vector3();

export function easeCamera(
  camera: THREE.PerspectiveCamera,
  delta: number,
  target: { readonly x: number; readonly y: number; readonly z: number },
): void {
  camera.position.x = THREE.MathUtils.damp(camera.position.x, target.x, 3, delta);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, target.y, 3, delta);
  camera.position.z = THREE.MathUtils.damp(camera.position.z, target.z, 3.2, delta);
  camera.lookAt(lookAt);
}
