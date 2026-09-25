/**
 * @file lib/landing/gsap.ts
 *
 * GSAP registration and a useGSAP-compatible hook for the public landing page.
 * ScrollTrigger instances created inside the hook are reverted on unmount.
 */

'use client';

import { useEffect, useRef, type DependencyList, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const EMPTY_DEPS: DependencyList = [];

type UseGSAPOptions = {
  scope?: RefObject<Element | null>;
  dependencies?: DependencyList;
};

/**
 * Runs a GSAP context for the lifetime of the component.
 * Tweens and ScrollTriggers created inside are killed on cleanup.
 */
export function useGSAP(factory: () => void | (() => void), options?: UseGSAPOptions): void {
  const factoryRef = useRef(factory);
  factoryRef.current = factory;
  const scopeRef = useRef(options?.scope);
  scopeRef.current = options?.scope;
  const dependencies = options?.dependencies ?? EMPTY_DEPS;

  useEffect(() => {
    let extra: void | (() => void);
    const ctx = gsap.context(() => {
      extra = factoryRef.current();
    }, scopeRef.current?.current ?? undefined);

    return () => {
      if (typeof extra === 'function') {
        extra();
      }
      ctx.revert();
    };
    // Caller-owned dependency list. Compared element-wise by React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export { gsap, ScrollTrigger };
