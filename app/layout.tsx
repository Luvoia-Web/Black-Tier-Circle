/**
 * @file app/layout.tsx
 *
 * Root App Router layout for Black Tier Circle.
 *
 * Wraps every route with shared metadata and Tailwind base styles.
 *
 * @module App
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Black Tier Circle',
  description: 'Multi-tenant Telegram reseller platform',
};

type RootLayoutProps = {
  readonly children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
