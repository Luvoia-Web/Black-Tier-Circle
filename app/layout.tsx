/**
 * @file app/layout.tsx
 *
 * Root layout. Outfit for the interface, JetBrains Mono for ids.
 * Dark is the default. A stored theme from before this system is migrated to dark once.
 *
 * @module App
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { JetBrains_Mono, Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  weight: ['300', '400', '500', '600', '700'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  weight: ['400', '500'],
});

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
    var version = localStorage.getItem('btc-theme-v');
    if (version !== '2') {
      localStorage.setItem('btc-theme', 'dark');
      localStorage.setItem('btc-theme-v', '2');
    }
    var stored = localStorage.getItem('btc-theme');
    document.documentElement.setAttribute('data-theme', stored === 'light' ? 'light' : 'dark');
  } catch (e) {}
`;

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrains.variable} ${outfit.className}`} suppressHydrationWarning>
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
              borderLeft: '3px solid var(--rose)',
              color: 'var(--ink)',
            },
          }}
        />
      </body>
    </html>
  );
}
