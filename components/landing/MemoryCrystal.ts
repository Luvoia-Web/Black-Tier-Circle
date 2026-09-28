/**
 * Memory Crystal — one Points draw and one LineSegments draw.
 * Particles move from spherical noise into a lattice as uProgress goes 0 → 1.
 */

import * as THREE from 'three';
import { crystal } from '@/lib/landing/crystal-state';

const POINT_VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aTarget;
attribute float aRandom;
attribute float aSize;
attribute float aColor;
attribute float aRole;

uniform float uProgress;
uniform float uVelocity;
uniform float uTime;
uniform float uPull;
uniform float uScatter;
uniform float uLight;

varying float vColor;
varying float vAlpha;

void main() {
  float edge0 = aRandom * 0.3;
  float edge1 = edge0 + 0.7;
  float t = smoothstep(edge0, edge1, uProgress);
  vec3 pos = mix(aStart, aTarget, t);

  vec3 curl = vec3(
    sin(aStart.y * 0.72 + uTime * 0.62 + aRandom * 4.0),
    cos(aStart.z * 0.64 - uTime * 0.48),
    sin(aStart.x * 0.8 + uTime * 0.52)
  ) * 4.0;
  pos += curl * (1.0 - uProgress) * 0.3;
  pos += curl * uScatter * 0.35;

  vec3 pulled = pos;
  if (aRole > 2.5) pulled = vec3(1.35, -0.75, 2.5);
  else if (aRole > 1.5) pulled = vec3(0.15, 0.15, 3.0);
  else if (aRole > 0.5) pulled = vec3(-1.25, 1.05, 2.55);
  pos = mix(pos, pulled, uPull * step(0.5, aRole));

  float breathe = sin(uTime * 1.5 + aRandom * 6.28318) * 0.045 * smoothstep(0.82, 1.0, uProgress);
  pos += normalize(aTarget + vec3(0.0001)) * breathe;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float depth = max(1.0, -mvPosition.z);
  float pulse = 1.0 + sin(uTime + aRandom * 6.28318) * 0.12 * smoothstep(0.8, 1.0, uProgress);
  float px = aSize * (1.0 + uVelocity * 2.0) * (200.0 / depth) * 0.09 * pulse;
  px *= mix(1.0, 1.12, uLight);
  gl_PointSize = clamp(px, 0.7, 7.0);

  vColor = aColor;
  vAlpha = 0.72 + uVelocity * 0.45;
}
`;

const POINT_FRAG = /* glsl */ `
precision highp float;

uniform float uLight;
uniform float uVelocity;
varying float vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;

  float edge = smoothstep(0.5, 0.12, d);
  float core = smoothstep(0.22, 0.0, d);

  vec3 blue = vec3(0.392, 0.216, 1.0);
  vec3 violet = vec3(0.659, 0.333, 0.969);
  vec3 gold = vec3(0.902, 0.706, 0.314);
  vec3 col = mix(blue, violet, smoothstep(0.0, 1.0, vColor));
  col = mix(col, gold, smoothstep(1.0, 2.0, vColor));

  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, mix(1.0, 0.9, uLight));

  float alpha = edge * (0.45 + core * 0.95) * vAlpha;
  alpha *= mix(1.0, 1.3, uLight);
  alpha = clamp(alpha + uVelocity * 0.12, 0.0, 1.0);

  vec3 glow = col + col * core * 1.15;
  gl_FragColor = vec4(glow, alpha);
}
`;

const LINE_VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aTarget;
attribute float aRandom;

uniform float uProgress;
uniform float uTime;
uniform float uScatter;
uniform vec3 uHover;

varying float vFade;
varying float vHover;

void main() {
  float t = smoothstep(0.12, 0.88, uProgress);
  vec3 pos = mix(aStart, aTarget, t);
  vec3 curl = vec3(
    sin(aStart.y * 0.7 + uTime * 0.5),
    cos(aStart.z * 0.6 - uTime * 0.4),
    sin(aStart.x * 0.8 + uTime * 0.45)
  );
  pos += curl * uScatter * 0.8;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vFade = t;
  vHover = smoothstep(1.6, 0.25, distance(pos, uHover));
}
`;

const LINE_FRAG = /* glsl */ `
precision highp float;

uniform float uVelocity;
varying float vFade;
varying float vHover;

void main() {
  float alpha = vFade * (0.3 + vHover * 0.55 + uVelocity * 0.15);
  vec3 col = mix(vec3(0.392, 0.216, 1.0), vec3(0.72, 0.86, 1.0), vHover);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.9));
}
`;

const BACKDROP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BACKDROP_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uMesh;
uniform float uLight;
uniform float uAspect;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  uv.x *= uAspect;
  float t = uTime * 0.045;
  float n = fbm(uv * 1.35 + vec2(t, -t * 0.55));
  float n2 = fbm(uv * 2.15 - vec2(t * 0.65, t * 0.25) + 4.0);
  vec3 voidCol = mix(vec3(0.008, 0.012, 0.039), vec3(0.941, 0.949, 1.0), uLight);
  vec3 violet = vec3(0.28, 0.08, 0.78);
  vec3 plasma = vec3(0.0, 0.62, 0.92);
  vec3 gold = vec3(0.85, 0.52, 0.18);
  float ink = (0.28 + uMesh * 0.72) * (1.0 - uLight * 0.25);
  vec3 col = voidCol;
  col = mix(col, violet, smoothstep(0.38, 0.78, n) * 0.55 * ink);
  col = mix(col, plasma, smoothstep(0.55, 0.92, n2) * 0.32 * ink);
  col += gold * smoothstep(0.74, 0.98, n) * 0.1 * uMesh;
  float vignette = smoothstep(1.15, 0.25, length(vUv - 0.5));
  col = mix(voidCol, col, 0.35 + vignette * 0.65);
  gl_FragColor = vec4(col, 1.0);
}
`;

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function spherePoint(rng: Rng, radius: number): [number, number, number] {
  const u = rng();
  const v = rng();
  const theta = Math.PI * 2 * u;
  const phi = Math.acos(2 * v - 1);
  const r = radius * Math.cbrt(rng());
  return [Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(theta) * r];
}

type Node = { x: number; y: number; z: number; chaos: [number, number, number] };

function buildLattice(rng: Rng): { nodes: Node[]; links: Array<[number, number]> } {
  const nodes: Node[] = [];
  const layers = 9;
  for (let layer = 0; layer < layers; layer += 1) {
    const tt = layer / (layers - 1);
    const y = (tt - 0.5) * 6.4;
    const profile = Math.sin(tt * Math.PI);
    const radius = 0.28 + profile * 2.55;
    const count = Math.max(8, Math.round(8 + profile * 14));
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + layer * 0.42;
      const chaos = spherePoint(rng, 8);
      nodes.push({
        x: Math.cos(a) * radius,
        y,
        z: Math.sin(a) * radius * 0.78,
        chaos,
      });
    }
  }
  for (let i = 0; i < 7; i += 1) {
    nodes.push({
      x: 0,
      y: (i / 6 - 0.5) * 5.6,
      z: 0,
      chaos: spherePoint(rng, 8),
    });
  }

  const links: Array<[number, number]> = [];
  const degree = new Array<number>(nodes.length).fill(0);
  const threshold = 1.18;
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    if (!a) continue;
    const near: Array<{ j: number; d: number }> = [];
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      if (!b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < threshold) {
        near.push({ j, d });
      }
    }
    near.sort((p, q) => p.d - q.d);
    for (const item of near) {
      const di = degree[i] ?? 0;
      const dj = degree[item.j] ?? 0;
      if (di >= 4 || dj >= 4) continue;
      links.push([i, item.j]);
      degree[i] = di + 1;
      degree[item.j] = dj + 1;
    }
  }
  return { nodes, links };
}

export class MemoryCrystal {
  readonly group = new THREE.Group();
  readonly uniforms: {
    uProgress: { value: number };
    uVelocity: { value: number };
    uTime: { value: number };
    uPull: { value: number };
    uScatter: { value: number };
    uLight: { value: number };
    uHover: { value: THREE.Vector3 };
  };
  readonly backdropUniforms: {
    uTime: { value: number };
    uMesh: { value: number };
    uLight: { value: number };
    uAspect: { value: number };
  };
  private readonly points: THREE.Points;
  private readonly lines: THREE.LineSegments;
  private readonly pointMat: THREE.ShaderMaterial;
  private readonly lineMat: THREE.ShaderMaterial;
  private elapsed = 0;

  constructor(count: number) {
    const rng = mulberry32(0x5eed);
    const { nodes, links } = buildLattice(rng);
    const featured = new Set<number>([
      Math.floor(nodes.length * 0.22),
      Math.floor(nodes.length * 0.5),
      Math.floor(nodes.length * 0.74),
    ]);

    const starts = new Float32Array(count * 3);
    const targets = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count);
    const roles = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const node = nodes[i % nodes.length];
      if (!node) continue;
      const start = spherePoint(rng, 8);
      starts[i * 3] = start[0];
      starts[i * 3 + 1] = start[1];
      starts[i * 3 + 2] = start[2];

      let tx = node.x;
      let ty = node.y;
      let tz = node.z;
      if (links.length > 0 && rng() < 0.22) {
        const link = links[Math.floor(rng() * links.length)];
        const na = link ? nodes[link[0]] : undefined;
        const nb = link ? nodes[link[1]] : undefined;
        if (na && nb) {
          const lt = rng();
          tx = na.x + (nb.x - na.x) * lt;
          ty = na.y + (nb.y - na.y) * lt;
          tz = na.z + (nb.z - na.z) * lt;
        }
      }
      const j = 0.02 + rng() * 0.11;
      const jit = spherePoint(rng, j);
      targets[i * 3] = tx + jit[0];
      targets[i * 3 + 1] = ty + jit[1];
      targets[i * 3 + 2] = tz + jit[2];
      randoms[i] = rng();
      sizes[i] = 0.8 + rng() * 1.7;
      const y = targets[i * 3 + 1] ?? 0;
      colors[i] = y > 1.35 ? 2 : y < -1.05 ? 0 : 1;
      const nodeIndex = i % nodes.length;
      if (featured.has(nodeIndex)) {
        const list = [...featured];
        const slot = list.indexOf(nodeIndex);
        roles[i] = slot + 1;
        const current = sizes[i] ?? 1;
        sizes[i] = Math.min(2.5, current + 0.6);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(targets.slice(), 3));
    geometry.setAttribute('aStart', new THREE.BufferAttribute(starts, 3));
    geometry.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 1));
    geometry.setAttribute('aRole', new THREE.BufferAttribute(roles, 1));
    geometry.computeBoundingSphere();

    this.uniforms = {
      uProgress: { value: 0 },
      uVelocity: { value: 0 },
      uTime: { value: 0 },
      uPull: { value: 0 },
      uScatter: { value: 0 },
      uLight: { value: 0 },
      uHover: { value: new THREE.Vector3() },
    };

    this.pointMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.points = new THREE.Points(geometry, this.pointMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;

    const linePositions = new Float32Array(links.length * 2 * 3);
    const lineStarts = new Float32Array(links.length * 2 * 3);
    const lineTargets = new Float32Array(links.length * 2 * 3);
    const lineRandom = new Float32Array(links.length * 2);
    links.forEach((link, index) => {
      const a = nodes[link[0]];
      const b = nodes[link[1]];
      if (!a || !b) return;
      const base = index * 6;
      const write = (node: Node, slot: number): void => {
        lineTargets[slot] = node.x;
        lineTargets[slot + 1] = node.y;
        lineTargets[slot + 2] = node.z;
        lineStarts[slot] = node.chaos[0];
        lineStarts[slot + 1] = node.chaos[1];
        lineStarts[slot + 2] = node.chaos[2];
        linePositions[slot] = node.x;
        linePositions[slot + 1] = node.y;
        linePositions[slot + 2] = node.z;
      };
      write(a, base);
      write(b, base + 3);
      lineRandom[index * 2] = rng();
      lineRandom[index * 2 + 1] = rng();
    });

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('aStart', new THREE.BufferAttribute(lineStarts, 3));
    lineGeo.setAttribute('aTarget', new THREE.BufferAttribute(lineTargets, 3));
    lineGeo.setAttribute('aRandom', new THREE.BufferAttribute(lineRandom, 1));

    this.lineMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.lines = new THREE.LineSegments(lineGeo, this.lineMat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 3;

    this.group.add(this.points);
    this.group.add(this.lines);

    this.backdropUniforms = {
      uTime: { value: 0 },
      uMesh: { value: 0.45 },
      uLight: { value: 0 },
      uAspect: { value: 1 },
    };
  }

  createBackdrop(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.backdropUniforms,
      vertexShader: BACKDROP_VERT,
      fragmentShader: BACKDROP_FRAG,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    return mesh;
  }

  update(delta: number): void {
    this.elapsed += delta;
    const light = crystal.light > 0.5;
    this.uniforms.uProgress.value = crystal.progress;
    this.uniforms.uVelocity.value = crystal.velocity;
    this.uniforms.uTime.value = this.elapsed;
    this.uniforms.uPull.value = crystal.pull;
    this.uniforms.uScatter.value = crystal.scatter;
    this.uniforms.uLight.value = crystal.light;
    const ox = this.group.position.x;
    this.uniforms.uHover.value.set(crystal.pointerNX * 8 - ox, crystal.pointerNY * 4.2, 0.3);
    this.pointMat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.lineMat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;

    this.backdropUniforms.uTime.value = this.elapsed;
    this.backdropUniforms.uMesh.value = crystal.mesh;
    this.backdropUniforms.uLight.value = crystal.light;

    const drift = crystal.spin === 0 ? 0 : delta * crystal.spin;
    this.group.rotation.y += drift;
    this.group.position.x = crystal.offsetX + crystal.pointerNX * 0.28;
    this.group.position.y = crystal.offsetY + Math.sin(this.elapsed * 0.45) * (crystal.spin === 0 ? 0 : 0.07) + crystal.pointerNY * 0.14;
    this.group.rotation.z = crystal.pointerNX * -0.04;
    this.group.scale.setScalar(crystal.scale);
  }

  setAspect(aspect: number): void {
    this.backdropUniforms.uAspect.value = aspect;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.lines.geometry.dispose();
    this.pointMat.dispose();
    this.lineMat.dispose();
  }
}
