/**
 * @file components/ui/DocumentTitle.tsx
 *
 * Sets document.title for client dashboard pages.
 *
 * @module Components
 */

'use client';

import { useEffect } from 'react';

export function DocumentTitle({ title }: { readonly title: string }): JSX.Element | null {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
