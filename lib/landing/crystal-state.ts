/**
 * Shared scroll state for the Memory Crystal.
 * GSAP tweens this object. The WebGL loop reads it. No React renders.
 */

export const crystal = {
  progress: 0,
  velocity: 0,
  offsetX: 1.7,
  offsetY: 0,
  scale: 1,
  spin: 0.16,
  mesh: 0.45,
  pull: 0,
  scatter: 0,
  light: 0,
  active: 1,
  pointerNX: 0,
  pointerNY: 0,
};

export function landingReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function landingMobile(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(max-width: 768px)').matches;
}
