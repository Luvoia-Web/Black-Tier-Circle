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
    extend: {},
  },
  plugins: [tailwindAnimate],
};

export default config;
