/**
 * Floating navigation for MemoryOS.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Menu, Moon, Sun, X } from 'lucide-react';
import { toggleTheme, useThemeDark } from '@/components/landing/useThemeDark';

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#architecture', label: 'Architecture' },
  { href: '#how', label: 'How It Works' },
  { href: '#pricing', label: 'Pricing' },
];

export function MemoryNav(): JSX.Element {
  const dark = useThemeDark();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = (): void => {
      setScrolled(window.scrollY > 50);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('mem-nav-open', open);
    return () => document.body.classList.remove('mem-nav-open');
  }, [open]);

  return (
    <header className={scrolled ? 'mem-nav is-scrolled' : 'mem-nav'}>
      <Link href="#hero" className="mem-logo" aria-label="Black Tier MemoryOS">
        <img src="/logo.png" alt="Black Tier Circle" className="h-8 w-8 object-contain" />
        <span className="mem-word">Black Tier MemoryOS</span>
      </Link>

      <nav className="mem-links" aria-label="Primary">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>

      <div className="mem-nav-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={(event) => toggleTheme({ x: event.clientX, y: event.clientY })}
        >
          {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
        <Link href="/login" className="btn btn-ghost nav-signin">
          Sign In
        </Link>
        <Link href="/login" className="btn btn-grad">
          Get Started
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <button
          type="button"
          className="icon-btn mem-burger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="mem-drawer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <nav aria-label="Mobile">
              {LINKS.map((link, index) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28, delay: 0.05 + index * 0.06 }}
                >
                  {link.label}
                </motion.a>
              ))}
            </nav>
            <Link href="/login" className="btn btn-grad" onClick={() => setOpen(false)}>
              Get Started
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
