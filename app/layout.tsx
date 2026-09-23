/**
 * @file app/layout.tsx
 *
 * Root App Router layout for Black Tier Circle.
 *
 * Wraps every route with Inter, theme bootstrap, and design-token styles.
 *
 * @module App
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: 'Black Tier Circle',
    template: '%s — Black Tier Circle',
  },
  description: 'Multi-tenant Telegram reseller platform',
};

type RootLayoutProps = {
  readonly children: ReactNode;
};

const THEME_BOOTSTRAP = `
  try {
    const t = localStorage.getItem('btc-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch(e) {}
`;

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--bg-elevated, var(--bg-card))',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
            },
          }}
        />
      </body>
    </html>
  );
}
