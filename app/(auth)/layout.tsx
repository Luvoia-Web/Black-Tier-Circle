/**
 * Auth screens keep the previous sheet, scoped so it cannot restyle the dashboard.
 */

import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './auth-legacy.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

type AuthLayoutProps = {
  readonly children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps): JSX.Element {
  return <div className={`auth-legacy min-h-screen ${inter.variable}`}>{children}</div>;
}
