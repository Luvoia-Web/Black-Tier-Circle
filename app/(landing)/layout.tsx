/**
 * @file app/(landing)/layout.tsx
 *
 * Public landing shell. Fonts and metadata live here; Lenis lives in the client shell.
 * This layout does not wrap the dashboard.
 */

import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Cormorant, Montserrat } from 'next/font/google';
import { LandingShell } from '@/components/landing/LandingShell';
import './landing.css';

const display = Cormorant({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Your Telegram store, live in minutes',
  description:
    'Connect your bot. Add products. Start selling. Black Tier Circle is a non-custodial Telegram commerce platform.',
};

type LandingLayoutProps = {
  readonly children: ReactNode;
};

export default function LandingLayout({ children }: LandingLayoutProps): JSX.Element {
  return (
    <div className={`${display.variable} ${sans.variable}`}>
      <LandingShell>{children}</LandingShell>
    </div>
  );
}
