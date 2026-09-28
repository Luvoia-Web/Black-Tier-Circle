/**
 * @file components/intelligence/IntelligenceBoard.tsx
 *
 * Reseller intelligence section: customer, store, and recovery panels.
 *
 * @module Components
 */

'use client';

import { useEffect, useState } from 'react';
import { CommerceRecoveryPanel } from '@/components/intelligence/CommerceRecoveryPanel';
import { CustomerIntelligencePanel } from '@/components/intelligence/CustomerIntelligencePanel';
import { StoreIntelligencePanel } from '@/components/intelligence/StoreIntelligencePanel';
import { PageHeader } from '@/components/ui/page-header';
import { DEMO_CUSTOMER_ID, DEMO_TENANT_ID } from '@/lib/intelligence-demo';
import { API_ROUTES } from '@/lib/navigation';

type Buyer = {
  readonly id: string;
  readonly buyer: string;
};

type IntelligenceBoardProps = {
  readonly tenantId: string;
};

export function IntelligenceBoard({ tenantId }: IntelligenceBoardProps): JSX.Element {
  const [customers, setCustomers] = useState<readonly Buyer[]>([]);
  const [customerId, setCustomerId] = useState(DEMO_CUSTOMER_ID);

  useEffect(() => {
    void fetch(API_ROUTES.resellerCustomers)
      .then(async (response) => response.json() as Promise<{ success?: boolean; data?: { rows?: Buyer[] } }>)
      .then((json) => {
        if (json.success && json.data?.rows) {
          setCustomers(json.data.rows);
        }
      })
      .catch(() => undefined);
  }, []);

  const selected = customers.find((customer) => customer.id === customerId);
  const storeTenant = customerId === DEMO_CUSTOMER_ID ? DEMO_TENANT_ID : tenantId;

  return (
    <div className="space-y-8">
      <PageHeader title="Intelligence" description="Customer memory, store learning, and recovery" />
      <label className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-2)]">
        Customer
        <select
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          className="btc-select"
          aria-label="Customer"
        >
          <option value={DEMO_CUSTOMER_ID}>Demo customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.buyer}
            </option>
          ))}
        </select>
      </label>
      <CustomerIntelligencePanel
        customerId={customerId}
        tenantId={storeTenant}
        {...(selected ? { customerName: selected.buyer } : { customerName: 'Demo customer' })}
      />
      <StoreIntelligencePanel tenantId={storeTenant} />
      <CommerceRecoveryPanel tenantId={storeTenant} />
    </div>
  );
}
