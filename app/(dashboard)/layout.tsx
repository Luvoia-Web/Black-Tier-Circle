/**
 * @file app/(dashboard)/layout.tsx
 *
 * Dashboard layout stub for owner and reseller homes.
 *
 * Phase 1 will gate this layout by session role. Phase 0 renders
 * children without an auth check.
 *
 * @module Dashboard
 */

import type { ReactNode } from 'react';

type DashboardLayoutProps = {
  readonly children: ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps): JSX.Element {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-6 py-4 text-sm text-zinc-400">
        Black Tier Circle
      </header>
      {children}
    </div>
  );
}
