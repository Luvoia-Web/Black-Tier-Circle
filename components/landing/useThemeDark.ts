/**
 * @file components/landing/useThemeDark.ts
 *
 * Reads the document theme attribute set by the root bootstrap script.
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

export function toggleTheme(): void {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  try {
    localStorage.setItem('btc-theme', next);
  } catch {
    /* private mode */
  }
}
