/**
 * @file app/(landing)/layout.tsx
 *
 * Public landing shell. Geist lives here so the dashboard keeps Inter.
 */

import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { LandingShell } from '@/components/landing/LandingShell';
import './landing.css';

export const metadata: Metadata = {
  title: 'Black Tier MemoryOS',
  description:
    'Three-layer AI memory for Telegram commerce. Every customer remembered. Every pattern learned. Every store optimized.',
};

type LandingLayoutProps = {
  readonly children: ReactNode;
};

export default function LandingLayout({ children }: LandingLayoutProps): JSX.Element {
  return (
    <div className={`${GeistSans.variable} ${GeistMono.variable} ${GeistSans.className}`}>
      <LandingShell>{children}</LandingShell>
    </div>
  );
}
