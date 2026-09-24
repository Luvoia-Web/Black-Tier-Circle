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

export default function ConnectSupplierPage(): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('ProdSeller');
  const [slug, setSlug] = useState('prodseller');
  const [baseUrl, setBaseUrl] = useState('https://prodseller.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [authHeaderName, setAuthHeaderName] = useState('X-API-Key');
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setTested(null);
    try {
      const response = await fetch(API_ROUTES.supplierConnect, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, baseUrl, apiKey, authHeaderName }),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: { username: string; balance: number; membership: string };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        toast.error(json.error?.message ?? 'Connection failed');
        return;
      }
      setTested(`Connected as @${json.data.username} | Balance: ${json.data.balance} USDT | Membership: ${json.data.membership}`);
      toast.success('Supplier saved');
      router.push(ROUTES.owner.supplier);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Connect Supplier" description="The key is tested against the supplier before it is stored." />
      <div className="max-w-xl rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <FormField label="Supplier Name" value={name} onChange={setName} />
        <FormField label="Slug" value={slug} onChange={setSlug} helper="Lowercase, used as a unique id" />
        <FormField label="Base URL" value={baseUrl} onChange={setBaseUrl} />
        <FormField label="API Key" type="password" value={apiKey} onChange={setApiKey} />
        <FormField label="Auth Header" value={authHeaderName} onChange={setAuthHeaderName} />
        <button type="button" className="btc-btn-primary mt-4" disabled={busy || apiKey.length < 8} onClick={() => void save()}>
          {busy ? 'Testing…' : 'Test Connection & Save'}
        </button>
        {tested ? <p className="mt-3 text-sm text-[var(--green)]">{tested}</p> : null}
      </div>
    </>
  );
}
