/**
 * @file app/(dashboard)/owner/supplier/[supplierId]/settings/page.tsx
 *
 * Rename a supplier, rotate its key, or pause the connection.
 */

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/settings/FormField';
import { PageHeader } from '@/components/ui/page-header';
import { API_ROUTES } from '@/lib/navigation';

export default function SupplierSettingsPage({ params }: { readonly params: { supplierId: string } }): JSX.Element {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [authHeaderName, setAuthHeaderName] = useState('X-API-Key');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('active');
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(API_ROUTES.supplierSettings(params.supplierId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(name ? { name } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          authHeaderName,
          status,
          ...(apiKey ? { apiKey } : {}),
        }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        toast.error(json.error?.message ?? 'Unable to save');
        return;
      }
      setApiKey('');
      toast.success('Supplier settings saved');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Supplier Settings" description="Rotate the API key without showing the saved value." />
      <div className="max-w-xl rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <FormField label="Name" value={name} onChange={setName} placeholder="Leave blank to keep the current name" />
        <FormField label="Base URL" value={baseUrl} onChange={setBaseUrl} placeholder="https://prodseller.com/v1" />
        <FormField label="Auth Header" value={authHeaderName} onChange={setAuthHeaderName} />
        <FormField label="Rotate API Key" type="password" value={apiKey} onChange={setApiKey} helper="Leave blank to keep the current key" />
        <label className="mt-3 block text-sm">
          Status
          <select className="btc-input mt-1" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </label>
        <button type="button" className="btc-btn-primary mt-4" disabled={busy} onClick={() => void save()}>
          Save Settings
        </button>
      </div>
    </>
  );
}
