/**
 * @file components/platform/drawer-body.tsx
 *
 * Lets an area page fill the shell drawer without unmounting the list.
 */

'use client';

import { createContext, useContext, type ReactNode } from 'react';

export const DrawerBodyContext = createContext<(node: ReactNode | null) => void>(() => {});

export function useSetDrawerBody(): (node: ReactNode | null) => void {
  return useContext(DrawerBodyContext);
}
