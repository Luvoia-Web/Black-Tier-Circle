/**
 * @file components/landing/LandingNav.tsx
 *
 * Fixed navigation. Glass fills in after the first scroll.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { ROUTES } from '@/lib/navigation';
import { lenisRef } from '@/lib/landing/store';
import { toggleTheme, useThemeDark } from '@/components/landing/useThemeDark';

const LINKS = [
  { href: '#how', label: 'How It Works' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
] as const;

export function LandingNav(): JSX.Element {
  const dark = useThemeDark();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const lenis = lenisRef.current;
    if (open) {
      lenis?.stop();
    } else {
      lenis?.start();
    }
  }, [open]);

  const go = (href: string): void => {
    setOpen(false);
    const lenis = lenisRef.current;
    if (lenis) {
      lenis.scrollTo(href, { offset: -88 });
      return;
    }
    document.querySelector(href)?.scrollIntoView({ block: 'start' });
  };

  return (
    <header className={`nav ${scrolled ? 'is-scrolled' : ''}`}>
      <Link href={ROUTES.home} className="wordmark" aria-label="Black Tier Circle home">
        <span className="mark" aria-hidden="true" />
        Black Tier Circle
      </Link>
      <nav className="nav-links" aria-label="Primary">
        {LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            onClick={(event) => {
              event.preventDefault();
              go(link.href);
            }}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div className="nav-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-pressed={!dark}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
        <Link href={ROUTES.login} className="btn-solid nav-cta">
          Start Selling
        </Link>
        <button
          type="button"
          className="icon-btn nav-burger"
          aria-expanded={open}
          aria-controls="landing-drawer"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>
      <AnimatePresence>
        {open ? (
          <motion.div
            id="landing-drawer"
            className="nav-drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.76, 0, 0.24, 1] }}
          >
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(event) => {
                  event.preventDefault();
                  go(link.href);
                }}
              >
                {link.label}
              </a>
            ))}
            <Link href={ROUTES.login} onClick={() => setOpen(false)}>
              Login
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
