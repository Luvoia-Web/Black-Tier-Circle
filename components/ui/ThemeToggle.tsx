/**
 * @file components/ui/ThemeToggle.tsx
 *
 * Dark/light mode toggle. Persists to localStorage as `btc-theme`.
 * Default theme is light.
 *
 * @module Components
 */

'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'btc-theme';

function readTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') {
    return 'light';
  }
  const current = document.documentElement.getAttribute('data-theme');
  return current === 'dark' ? 'dark' : 'light';
}

function applyTheme(next: 'dark' | 'light'): void {
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Theme still applies for this session if storage is unavailable.
  }
}

/**
 * Circular sun/moon button that toggles `data-theme` on `<html>`.
 */
export function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    const stored = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
    const initial: 'dark' | 'light' = stored === 'dark' ? 'dark' : 'light';
    applyTheme(initial);
    setTheme(initial);
  }, []);

  function handleToggle(): void {
    const next = readTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-raised)] text-[var(--text-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-1)]"
    >
      <motion.span
        key={theme}
        initial={{ rotate: -40, scale: 0.8, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </motion.span>
    </button>
  );
}

function SunIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 14.3A8.5 8.5 0 1 1 9.7 3a7 7 0 0 0 11.3 11.3z" />
    </svg>
  );
}

export default ThemeToggle;