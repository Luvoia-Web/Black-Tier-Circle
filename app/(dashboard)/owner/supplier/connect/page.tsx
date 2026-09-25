/**
 * @file app/(dashboard)/owner/supplier/connect/page.tsx
 *
 * Tests a supplier key before it is encrypted and saved.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FormField } from '@/components/settings/FormField';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES, ROUTES } from '@/lib/navigation';

type Probe = {
  readonly username: string;
  readonly balance: number;
  readonly membership: string;
  readonly productCount: number;
  readonly warning: string | null;
};

export default function ConnectSupplierPage(): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<Probe | null>(null);

  async function submit(save: boolean): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(API_ROUTES.supplierConnect, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'Supplier',
          apiKey,
          ...(endpoint.trim().length > 0 ? { endpoint: endpoint.trim() } : {}),
          save,
        }),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: Probe;
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setProbe(null);
        toast.error(json.error?.message ?? 'Could not connect to supplier. Please check your API key and try again.');
        return;
      }
      setProbe(json.data);
      if (json.data.warning) {
        toast.message(json.data.warning);
      }
      if (save) {
        toast.success('Supplier saved');
        router.push(ROUTES.owner.supplier);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Connect Supplier" description="Test the key first. It is stored only after the connection succeeds." />
      <div className="max-w-xl rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <FormField
          label="Supplier Name"
          value={name}
          onChange={(value) => {
            setName(value);
            setProbe(null);
          }}
          placeholder="ProdSeller, MySupplier"
          helper="Give this supplier a name"
        />
        <FormField
          label="API Key"
          type="password"
          value={apiKey}
          onChange={(value) => {
            setApiKey(value);
            setProbe(null);
          }}
          helper="Your supplier API key"
        />
        <FormField
          label="API Endpoint"
          value={endpoint}
          onChange={(value) => {
            setEndpoint(value);
            setProbe(null);
          }}
          placeholder="https://supplier.com/api/v1"
          helper="Optional. Leave blank to auto-detect ProdSeller."
        />
        <button
          type="button"
          className="btc-btn-primary mt-4"
          disabled={busy || apiKey.trim().length < 8}
          onClick={() => void submit(false)}
        >
          {busy ? 'Testing…' : 'Test Connection'}
        </button>
        {probe ? (
          <div className="mt-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-raised)] p-4 text-sm">
            <p className="text-[var(--text-1)]">Connected as @{probe.username}</p>
            <p className="mt-1 text-[var(--text-2)]">Balance: {probe.balance} USDT</p>
            <p className="mt-1 text-[var(--text-2)]">Products: {probe.productCount}</p>
            {probe.warning ? <p className="mt-2 text-[var(--amber)]">{probe.warning}</p> : null}
            <button type="button" className="btc-btn-primary mt-4" disabled={busy} onClick={() => void submit(true)}>
              {busy ? 'Saving…' : 'Save Supplier'}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
