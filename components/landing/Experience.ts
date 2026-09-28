/**
 * Raw Three.js stage for the landing page. Not a React component.
 * Pauses when the canvas leaves the viewport or the tab is hidden.
 */

import * as THREE from 'three';
import { MemoryCrystal } from '@/components/landing/MemoryCrystal';
import { crystal, landingMobile, landingReducedMotion } from '@/lib/landing/crystal-state';

export const experienceHandle: { current: Experience | null } = { current: null };

export class Experience {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly clock: THREE.Clock;
  private readonly memory: MemoryCrystal;
  private readonly backdrop: THREE.Mesh;
  private readonly onResize: () => void;
  private readonly onVisibility: () => void;
  private readonly onPointer: (event: PointerEvent) => void;
  private observer: IntersectionObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private visible = true;
  private live = true;
  private looping = false;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const mobile = landingMobile();
    const reduced = landingReducedMotion();
    if (mobile) {
      crystal.offsetX = 0;
    }
    if (reduced) {
      crystal.progress = 1;
      crystal.spin = 0;
    }
    crystal.light = document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !mobile,
      alpha: false,
      powerPreference: mobile ? 'low-power' : 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    this.renderer.setClearColor(crystal.light > 0.5 ? 0xf0f2ff : 0x02030a, 1);

    this.scene = new THREE.Scene();
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 80);
    this.camera.position.set(0, 0.15, 14);
    this.clock = new THREE.Clock();

    this.memory = new MemoryCrystal(mobile ? 25000 : 50000);
    this.memory.setAspect(aspect);
    this.scene.add(this.memory.group);
    this.backdrop = this.memory.createBackdrop();
    this.scene.add(this.backdrop);

    this.onResize = () => this.resize();
    this.onVisibility = () => this.syncLoop();
    this.onPointer = (event: PointerEvent) => {
      crystal.pointerNX = (event.clientX / window.innerWidth) * 2 - 1;
      crystal.pointerNY = -((event.clientY / window.innerHeight) * 2 - 1);
    };

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pointermove', this.onPointer, { passive: true });

    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        this.visible = entry ? entry.isIntersecting : true;
        this.syncLoop();
      },
      { threshold: 0.01 },
    );
    this.observer.observe(canvas);

    this.themeObserver = new MutationObserver(() => {
      crystal.light = document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0;
      this.renderer.setClearColor(crystal.light > 0.5 ? 0xf0f2ff : 0x02030a, 1);
    });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    this.resize();
    this.syncLoop();
    experienceHandle.current = this;
  }

  setLive(on: boolean): void {
    this.live = on;
    this.syncLoop();
  }

  private syncLoop(): void {
    if (this.disposed) return;
    const should = this.visible && this.live && !document.hidden;
    if (should && !this.looping) {
      this.clock.getDelta();
      this.renderer.setAnimationLoop(this.tick);
      this.looping = true;
    } else if (!should && this.looping) {
      this.renderer.setAnimationLoop(null);
      this.looping = false;
    }
  }

  private readonly tick = (): void => {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    crystal.velocity *= Math.exp(-delta * 2.6);
    this.memory.update(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const width = window.innerWidth;
    const height = Math.max(window.innerHeight, 1);
    const mobile = width < 768;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    this.renderer.setSize(width, height, false);
    this.memory.setAspect(width / height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.looping = false;
    this.observer?.disconnect();
    this.themeObserver?.disconnect();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointermove', this.onPointer);
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose());
      } else if (material) {
        material.dispose();
      }
    });
    this.memory.dispose();
    this.renderer.dispose();
    if (experienceHandle.current === this) {
      experienceHandle.current = null;
    }
  }
}
