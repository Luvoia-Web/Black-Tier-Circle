/**
 * @file components/landing/quality.ts
 *
 * Device tier for the landing WebGL scenes.
 * Mobile cuts particle count and geometry segments.
 */

export type LandingQuality = {
  readonly mobile: boolean;
  readonly particles: number;
  readonly segments: number;
  readonly dpr: number;
};

export function readLandingQuality(): LandingQuality {
  const mobile = window.innerWidth < 768;
  return {
    mobile,
    particles: mobile ? 500 : 2000,
    segments: mobile ? 32 : 128,
    dpr: mobile ? 1.5 : 2,
  };
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return gl !== null;
  } catch {
    return false;
  }
}
