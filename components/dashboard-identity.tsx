/**
 * @file components/dashboard-identity.tsx
 *
 * Signed-in name and role for dashboard chrome that sits under the layout.
 *
 * @module Components
 */

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { UserRole } from '@/modules/identity/types';

type DashboardIdentityValue = {
  readonly displayName: string;
  readonly role: UserRole;
};

const DashboardIdentityContext = createContext<DashboardIdentityValue>({
  displayName: '',
  role: 'reseller',
});

/**
 * Provides the layout profile to client pages.
 */
export function DashboardIdentityProvider({
  displayName,
  role,
  children,
}: DashboardIdentityValue & { readonly children: ReactNode }): JSX.Element {
  return <DashboardIdentityContext.Provider value={{ displayName, role }}>{children}</DashboardIdentityContext.Provider>;
}

/**
 * Reads the layout profile. Falls back to an empty name outside the provider.
 */
export function useDashboardIdentity(): DashboardIdentityValue {
  return useContext(DashboardIdentityContext);
}
