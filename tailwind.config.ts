/**
 * @file tailwind.config.ts
 *
 * Tailwind CSS content paths for App Router pages.
 *
 * @module Config
 */

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './modules/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
