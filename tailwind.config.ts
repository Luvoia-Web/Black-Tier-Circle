/**
 * @file tailwind.config.ts
 *
 * Tailwind CSS content paths for App Router pages and shared components.
 *
 * @module Config
 */

import type { Config } from 'tailwindcss';
import tailwindAnimate from 'tailwindcss-animate';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        base: 'var(--base)',
        crimson: 'var(--crimson)',
        'crimson-deep': 'var(--crimson-deep)',
        ember: 'var(--ember)',
        mint: 'var(--mint)',
        ice: 'var(--ice)',
        fault: 'var(--fault)',
        page: 'var(--page)',
        plane: 'var(--plane)',
        raised: 'var(--raised)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-faint': 'var(--ink-faint)',
        stroke: 'var(--stroke)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
      },
      fontFamily: {
        sans: ['var(--font-instrument)', 'Instrument Sans', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;
