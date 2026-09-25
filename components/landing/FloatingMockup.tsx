/**
 * @file components/landing/FloatingMockup.tsx
 *
 * Two obsidian screens yaw open with the section scroll.
 * The panels are HTML, placed in the scene with CSS2D so they stay sharp.
 */

'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { readLandingQuality } from '@/components/landing/quality';
import { addStudioLights, createStage } from '@/components/landing/webgl-stage';

type FloatingMockupProps = {
  readonly progressRef: React.MutableRefObject<number>;
};

function panel(html: string): CSS2DObject {
  const element = document.createElement('div');
  element.innerHTML = html;
  const object = new CSS2DObject(element);
  return object;
}

const DASHBOARD = `
  <div class="mock-panel">
    <header class="mock-head"><span>Owner</span><i class="mock-live">Live</i></header>
    <p class="mock-kicker">Wallet</p>
    <p class="mock-figure mock-tick">2,481.60 USDT</p>
    <ul class="mock-rows">
      <li><span>Order #18420</span><b>Paid</b></li>
      <li><span>Order #18421</span><b>Delivered</b></li>
      <li><span>Bot</span><b class="is-on">Online</b></li>
    </ul>
  </div>`;

const CHAT = `
  <div class="mock-panel mock-chat">
    <header class="mock-head"><span>Your store bot</span><i>Telegram</i></header>
    <div class="mock-bubble in">/start</div>
    <div class="mock-bubble out">Welcome. Three products are live.</div>
    <div class="mock-product"><span>Vault Pass</span><b>12 USDT</b></div>
    <div class="mock-bubble in">Paid · BEP20</div>
    <div class="mock-bubble out">Delivered. Key is in this chat.</div>
  </div>`;

export default function FloatingMockup({ progressRef }: FloatingMockupProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const progressLive = useRef(progressRef);
  progressLive.current = progressRef;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const quality = readLandingQuality();
    const stage = createStage(host, {
      dpr: quality.dpr,
      fov: 36,
      z: quality.mobile ? 6.6 : 5.5,
    });
    addStudioLights(stage.scene, false);

    const shell = new THREE.MeshStandardMaterial({ color: '#141210', metalness: 0.65, roughness: 0.28 });
    const left = new THREE.Mesh(new THREE.BoxGeometry(3.15, 2.05, 0.08), shell);
    left.position.set(-1.15, 0.2, 0);
    left.rotation.y = 0.28;
    const right = new THREE.Mesh(new THREE.BoxGeometry(3.15, 2.05, 0.08), shell);
    right.position.set(1.35, -0.15, -0.35);
    right.rotation.y = -0.38;

    const css = new CSS2DRenderer();
    css.domElement.style.position = 'absolute';
    css.domElement.style.inset = '0';
    css.domElement.style.pointerEvents = 'none';
    host.appendChild(css.domElement);

    const dash = panel(DASHBOARD);
    dash.position.set(0, 0, 0.08);
    left.add(dash);
    const chat = panel(CHAT);
    chat.position.set(0, 0, 0.08);
    right.add(chat);

    const rig = new THREE.Group();
    rig.add(left, right);
    stage.scene.add(rig);

    const resizeLabels = (): void => {
      css.setSize(host.clientWidth, host.clientHeight);
    };
    resizeLabels();
    const resizeObserver = new ResizeObserver(resizeLabels);
    resizeObserver.observe(host);

    let visible = true;
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
    }, { rootMargin: '200px' });
    observer.observe(host);

    let yaw = -0.42;
    const stop = stage.start((delta, elapsed) => {
      if (!visible) {
        return;
      }
      const target = -0.42 + progressLive.current.current * 0.85;
      yaw = THREE.MathUtils.damp(yaw, target, 3, delta);
      rig.rotation.y = yaw;
      left.position.y = 0.2 + Math.sin(elapsed * 0.8) * 0.06;
      right.position.y = -0.15 + Math.cos(elapsed * 0.7) * 0.06;
      css.render(stage.scene, stage.camera);
    });

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      left.geometry.dispose();
      right.geometry.dispose();
      shell.dispose();
      css.domElement.remove();
      stop();
    };
  }, []);

  return <div ref={hostRef} className="scene-slot mock-scene" aria-hidden="true" />;
}
