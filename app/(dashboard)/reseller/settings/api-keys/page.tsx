/**
 * @file app/(dashboard)/reseller/settings/api-keys/page.tsx
 *
 * Reseller API key management for the public v1 API.
 *
 * @module Dashboard
 */

'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { API_CONFIG } from '@/lib/api-config';
import { API_ROUTES } from '@/lib/navigation';
import type { ApiScope } from '@/modules/public-api/types';

type KeyRow = {
  readonly id: string;
  readonly keyPrefix: string;
  readonly label: string;
  readonly environment: 'live' | 'test';
  readonly scopes: ApiScope[];
  readonly isActive: boolean;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
};

const inputClass =
  'rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]';

/**
 * Lists, creates, and revokes reseller API keys.
 */
export default function ResellerApiKeysPage(): JSX.Element {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [environment, setEnvironment] = useState<'test' | 'live'>('test');
  const [scopes, setScopes] = useState<ApiScope[]>([...API_CONFIG.defaultScopes]);
  const [expiresAt, setExpiresAt] = useState('');
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.resellerApiKeys);
      const json = (await response.json()) as {
        success: boolean;
        data?: { keys: KeyRow[] };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load API keys');
        return;
      }
      setKeys(json.data.keys);
    } catch {
      setError('Unable to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleScope(scope: ApiScope): void {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  }

  async function createKey(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { label, environment, scopes };
      if (expiresAt) {
        body.expiresAt = new Date(expiresAt).toISOString();
      }
      const response = await fetch(API_ROUTES.resellerApiKeys, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: { rawKey: string };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to create key');
        return;
      }
      setRawKey(json.data.rawKey);
      setShowForm(false);
      setLabel('');
      await load();
    } catch {
      setError('Unable to create key');
    } finally {
      setSaving(false);
    }
  }

  async function revoke(keyId: string): Promise<void> {
    if (!window.confirm('Revoke this API key? Existing integrations will stop working immediately.')) {
      return;
    }
    const response = await fetch(API_ROUTES.resellerApiKey(keyId), { method: 'DELETE' });
    const json = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      setError(json.error?.message ?? 'Unable to revoke key');
      return;
    }
    await load();
  }

  const columns: ReadonlyArray<DataTableColumn<KeyRow>> = [
    { key: 'label', header: 'Label', render: (row) => row.label },
    {
      key: 'env',
      header: 'Environment',
      render: (row) => (
        <span className={row.environment === 'live' ? 'text-[var(--green)]' : 'text-[var(--amber)]'}>
          {row.environment}
        </span>
      ),
    },
    { key: 'prefix', header: 'Prefix', render: (row) => <code className="text-xs">{row.keyPrefix}…</code> },
    { key: 'scopes', header: 'Scopes', render: (row) => row.scopes.join(', ') },
    {
      key: 'created',
      header: 'Created',
      render: (row) => new Date(row.createdAt).toLocaleString(),
    },
    {
      key: 'used',
      header: 'Last used',
      render: (row) => (row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : 'Never'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (row.isActive ? 'Active' : 'Revoked'),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.isActive ? (
          <button type="button" className="text-sm text-[var(--red)] hover:text-red-300" onClick={() => void revoke(row.id)}>
            Revoke
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Developer API"
        description="Generate keys in the bot or here. Full docs at /api-docs"
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-1)]"
              onClick={() => void load()}
            >
              Refresh
            </button>
            <button
              type="button"
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-soft)]"
              onClick={() => setShowForm(true)}
            >
              Create New Key
            </button>
          </div>
        }
      />
      {error ? <p className="mb-4 text-sm text-[var(--red)]">{error}</p> : null}
      <label className="mb-4 flex items-center gap-2 text-sm text-[var(--text-2)]">
        <input type="checkbox" checked={showRevoked} onChange={(event) => setShowRevoked(event.target.checked)} />
        Show revoked
      </label>
      {rawKey ? (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-200">
            This key will only be shown once. Copy it now and store it securely.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-[var(--bg-page)] p-3 text-sm text-[var(--text-1)]">{rawKey}</pre>
          <button
            type="button"
            className="mt-3 text-sm text-[var(--accent-soft)]"
            onClick={() => void navigator.clipboard.writeText(rawKey)}
          >
            Copy key
          </button>
        </div>
      ) : null}
      {showForm ? (
        <form onSubmit={(event) => void createKey(event)} className="mb-6 space-y-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <label className="block text-sm">
            Label
            <input className={`${inputClass} mt-1 w-full`} value={label} onChange={(e) => setLabel(e.target.value)} required />
          </label>
          <div className="flex gap-3 text-sm">
            <button
              type="button"
              className={`rounded-md px-3 py-2 ${environment === 'test' ? 'bg-yellow-500/20 text-yellow-200' : 'bg-[var(--bg-raised)] text-[var(--text-2)]'}`}
              onClick={() => setEnvironment('test')}
            >
              Test
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-2 ${environment === 'live' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-[var(--bg-raised)] text-[var(--text-2)]'}`}
              onClick={() => setEnvironment('live')}
            >
              Live
            </button>
          </div>
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 text-[var(--text-2)]">Scopes</legend>
            {API_CONFIG.allScopes.map((scope) => (
              <label key={scope} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                />
                {scope}
              </label>
            ))}
          </fieldset>
          <label className="block text-sm">
            Expires (optional)
            <input
              type="datetime-local"
              className={`${inputClass} mt-1 w-full`}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create key'}
            </button>
            <button type="button" className="text-sm text-[var(--text-2)]" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {loading ? (
        <p className="text-sm text-[var(--text-2)]">Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={keys.filter((key) => showRevoked || key.isActive)}
          rowKey={(row) => row.id}
          emptyMessage="No API keys issued yet"
        />
      )}
    </>
  );
}
