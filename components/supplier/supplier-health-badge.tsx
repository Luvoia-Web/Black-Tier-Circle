'use client';

/**
 * @file components/supplier/supplier-health-badge.tsx
 *
 * Fetches /api/supplier/health and shows connected/error.
 *
 * @module Components
 */

import { useEffect, useState } from 'react';
import { API_ROUTES } from '@/lib/navigation';

type HealthPayload = {
  readonly healthy: boolean;
  readonly supplier: string;
  readonly mode: string;
};

/**
 * Live supplier health chip for the owner dashboard.
 */
export function SupplierHealthBadge(): JSX.Element {
  const [label, setLabel] = useState('Checking supplier…');

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(API_ROUTES.supplierHealth);
        const json = (await response.json()) as {
          success: boolean;
          data?: HealthPayload;
        };
        if (!json.success || !json.data) {
          setLabel('Supplier health: error');
          return;
        }
        setLabel(json.data.healthy ? 'Supplier connected' : 'Supplier error');
      } catch {
        setLabel('Supplier health: error');
      }
    })();
  }, []);

  return <span className="text-sm text-[var(--text-2)]">{label}</span>;
}
