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
import { Instrument_Sans, Inter, JetBrains_Mono } from 'next/font/google';
import './legacy-dashboard.css';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: {
    default: 'Black Tier Circle',
    template: '%s — Black Tier Circle',
  },
  description: 'Multi-tenant Telegram reseller platform',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
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
    <html lang="en" className={`${inter.variable} ${instrument.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 2000,
            style: {
              background: 'var(--raised)',
              border: '1px solid var(--stroke)',
              borderLeft: '3px solid var(--crimson)',
              color: 'var(--ink)',
            },
          }}
        />
      </body>
    </html>
  );
}
