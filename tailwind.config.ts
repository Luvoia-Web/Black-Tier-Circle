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
        violet: channel('--c-violet'),
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
        lg: '20px',
        xl: '24px',
        pill: '999px',
      },
      boxShadow: {
        card: 'inset 0 1px 0 rgb(255 255 255 / 0.07), 0 20px 50px rgb(0 0 0 / 0.25)',
        glass: 'inset 0 1px 0 rgb(255 255 255 / 0.14), 0 30px 70px rgb(0 0 0 / 0.45)',
      },
      spacing: {
        sidebar: '256px',
        rail: '76px',
        bar: '60px',
      },
      backdropBlur: {
        glass: '24px',
        card: '22px',
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;
