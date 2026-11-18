/**
 * @file tailwind.config.ts
 *
 * Theme keys for the dashboard. Colours read the RGB channels in globals.css
 * so `bg-rose/20` follows the active theme. Do not reach for `bg-[var(--x)]`.
 *
 * @module Config
 */

import type { Config } from 'tailwindcss';
import tailwindAnimate from 'tailwindcss-animate';

const channel = (name: string): string => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        base: channel('--c-base'),
        rose: {
          DEFAULT: channel('--c-rose'),
          deep: channel('--c-rose-deep'),
        },
        amber: channel('--c-amber'),
        sky: channel('--c-sky'),
        mint: channel('--c-mint'),
        danger: channel('--c-danger'),
        ice: channel('--c-ice'),
        ink: {
          DEFAULT: channel('--c-ink'),
          soft: channel('--c-ink-soft'),
          faint: channel('--c-ink-faint'),
        },
        page: channel('--c-page'),
        plane: channel('--c-plane'),
        raised: channel('--c-raised'),
        card: channel('--c-card'),
        stroke: 'rgb(var(--c-stroke) / 0.12)',
        crimson: channel('--c-rose'),
        'crimson-deep': channel('--c-rose-deep'),
        ember: channel('--c-amber'),
        fault: channel('--c-danger'),
        ok: channel('--c-mint'),
        warn: channel('--c-amber'),
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'Outfit', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '300' }],
      },
      borderRadius: {
        sm: '10px',
        md: '14px',
        lg: '22px',
        xl: '28px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 18px 40px rgb(0 0 0 / 0.28)',
        glass: '0 24px 60px rgb(0 0 0 / 0.35), inset 0 1px 0 rgb(255 255 255 / 0.12)',
      },
      spacing: {
        sidebar: '272px',
        rail: '76px',
        bar: '64px',
      },
      backdropBlur: {
        glass: '24px',
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;
