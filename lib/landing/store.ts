/**
 * @file lib/landing/store.ts
 *
 * Shared pointer and Lenis handles for the landing page.
 * Mutated outside React so the render loop never calls setState.
 */

import type Lenis from 'lenis';

export const landingPointer = { x: 0, y: 0 };

export const lenisRef: { current: Lenis | null } = { current: null };
