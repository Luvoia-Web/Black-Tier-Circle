/**
 * Theme toggle with a circular clip reveal from the control.
 */

'use client';

import { useEffect, useState } from 'react';

export function useThemeDark(): boolean {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const read = (): void => {
      setDark(root.getAttribute('data-theme') !== 'light');
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

type ThemeOrigin = { readonly x: number; readonly y: number } | { readonly clientX: number; readonly clientY: number };

export function toggleTheme(origin?: ThemeOrigin): void {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  const apply = (): void => {
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('btc-theme', next);
    } catch {
      /* private mode */
    }
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const x = origin && 'clientX' in origin ? origin.clientX : origin?.x;
  const y = origin && 'clientY' in origin ? origin.clientY : origin?.y;
  const start = document.startViewTransition?.bind(document);
  if (!reduced && x !== undefined && y !== undefined && start) {
    root.style.setProperty('--theme-x', `${x}px`);
    root.style.setProperty('--theme-y', `${y}px`);
    start(apply);
    return;
  }
  apply();
}
