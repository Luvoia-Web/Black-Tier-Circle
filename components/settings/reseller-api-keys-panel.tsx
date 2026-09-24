/**
 * @file components/settings/reseller-api-keys-panel.tsx
 *
 * Compact API key manager embedded on reseller settings.
 *
 * @module Components
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';
import { API_ROUTES } from '@/lib/navigation';
import { SettingsCard } from '@/components/settings/SettingsCard';

type KeyRow = {
  readonly id: string;
  readonly keyPrefix: string;
  readonly label: string;
  readonly isActive: boolean;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
};

/**
 * Lists masked keys and reveals a new key once.
 */
export function ResellerApiKeysPanel(): JSX.Element {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [label, setLabel] = useState('Store key');
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const response = await fetch(API_ROUTES.resellerApiKeys);
    const json = (await response.json()) as { success?: boolean; data?: { keys?: KeyRow[] } };
    if (json.success && json.data?.keys) {
      setKeys(json.data.keys);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate(): Promise<void> {
    if (label.trim().length < 2) {
      toast.error('Add a label for this key');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(API_ROUTES.resellerApiKeys, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), environment: 'live' }),
      });
      const json = (await response.json()) as {
        success?: boolean;
        data?: { rawKey?: string };
        error?: { message?: string };
      };
      if (!response.ok || !json.success || !json.data?.rawKey) {
        toast.error(json.error?.message ?? 'Unable to generate a key');
        return;
      }
      setRawKey(json.data.rawKey);
      toast.success('Copy the key now. It will not be shown again.');
      await load();
    } catch {
      toast.error('Unable to generate a key');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string): Promise<void> {
    const response = await fetch(API_ROUTES.resellerApiKey(id), { method: 'DELETE' });
    if (!response.ok) {
      toast.error('Unable to revoke key');
      return;
    }
    toast.success('Key revoked');
    await load();
  }

  return (
    <SettingsCard icon={<KeyRound size={18} />} title="API keys" description="Access your store data programmatically">
      <ul className="space-y-3">
        {keys.length === 0 ? <li className="text-sm text-[var(--text-2)]">No keys yet.</li> : null}
        {keys.map((key) => (
          <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-[var(--text-1)]">{key.label}</span>
            <code>{key.keyPrefix}…</code>
            <span className="text-[var(--text-3)]">{new Date(key.createdAt).toLocaleDateString()}</span>
            <span className="text-[var(--text-3)]">{key.lastUsedAt ? 'Used' : 'Never used'}</span>
            {key.isActive ? (
              <button type="button" className="min-h-11 text-[var(--red)]" onClick={() => void revoke(key.id)}>
                Revoke
              </button>
            ) : (
              <span className="text-[var(--text-3)]">Revoked</span>
            )}
          </li>
        ))}
      </ul>
      <label className="mt-4 block text-sm text-[var(--text-2)]" htmlFor="api-key-label">
        Label
        <input id="api-key-label" className="btc-input mt-1 w-full" value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <button type="button" className="btc-btn-primary mt-3" disabled={busy} onClick={() => void generate()}>
        {busy ? 'Generating…' : 'Generate API key'}
      </button>
      {rawKey ? (
        <p className="mt-3 text-sm text-[var(--text-2)]">
          <code className="break-all text-[var(--text-1)]">{rawKey}</code>{' '}
          <button type="button" className="min-h-11 text-[var(--accent-soft)]" onClick={() => void copyToClipboard(rawKey)}>
            Copy
          </button>
        </p>
      ) : null}
    </SettingsCard>
  );
}
