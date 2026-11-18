'use client';

/**
 * Store. The preview uses the same product card builder the bot sends.
 */

import { useEffect, useState } from 'react';
import { Button, EmptyState, ErrorState, RelativeTime, SelectField, SwitchField, TextAreaField, TextField } from '@/components/platform/ui';
import { API_ROUTES } from '@/lib/navigation';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { productCardText, type ShopProduct } from '@/modules/catalog/shop-screen';
import { BUTTON_KEYS, PRODUCT_CARD_FIELDS, type ProductCardField, type StoreConfig } from '@/modules/store-config/types';
import { renderTemplate } from '@/modules/store-config/template';
import type { PreviewProduct } from '@/modules/platform/store';

type StorePayload = {
  readonly role: 'owner' | 'reseller';
  readonly studio: { readonly config: StoreConfig; readonly version: number; readonly defaults: StoreConfig };
  readonly products: readonly PreviewProduct[];
  readonly storeStatus: 'open' | 'maintenance';
  readonly maintenanceMessage: string;
  readonly statusNeedsMigration: boolean;
  readonly bot: { readonly username: string | null; readonly status: string; readonly lastHealthAt: string | null };
};

function toShop(product: PreviewProduct): ShopProduct {
  return {
    id: product.id,
    title: product.title,
    category: product.category,
    priceMinor: BigInt(product.priceMinor),
    stockUnlimited: product.stockUnlimited,
    stockCount: product.stockCount,
    supplierInStock: product.supplierInStock,
    soldCount: null,
    description: product.description,
    durationText: product.durationText,
    warrantyText: product.warrantyText,
    typeLabel: null,
    deliveryType: product.deliveryType,
    requiresEmailActivation: product.requiresEmailActivation,
    imageUrl: null,
  };
}

export function StoreView(): JSX.Element {
  const store = useData<StorePayload>('/api/platform/store');
  const [draft, setDraft] = useState<StoreConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [productId, setProductId] = useState('');
  const [token, setToken] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [saveError, setSaveError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (store.data && draft === null) {
      setDraft(store.data.studio.config);
      setVersion(store.data.studio.version);
      setStatusMessage(store.data.maintenanceMessage);
      setProductId(store.data.products[0]?.id ?? '');
    }
  }, [store.data, draft]);

  if (store.loading && !draft) {
    return <p className="text-sm text-ink-soft">Loading the store…</p>;
  }
  if (store.error && !draft) {
    return <ErrorState message={store.error.message} requestId={store.error.requestId} detail={store.error.detail} onRetry={store.refetch} />;
  }
  if (!store.data || !draft) {
    return <EmptyState title="The store is not available" message="Refresh the page. If this stays empty, the store settings could not be read." />;
  }
  const loaded = store.data;
  const config = draft;

  const dirty = JSON.stringify(config) !== JSON.stringify(loaded.studio.config);
  const chosen = loaded.products.find((product) => product.id === productId) ?? loaded.products[0];
  const card = chosen
    ? productCardText(toShop(chosen), loaded.studio.config.catalog.templates, undefined, config.productCard)
    : '';
  const welcome = renderTemplate(config.welcome, { store: 'Your store', balance: '0.00 USDT', name: 'Buyer' });

  function moveField(index: number, direction: number): void {
    const fields = [...config.productCard.fields];
    const next = index + direction;
    const current = fields[index];
    const swap = fields[next];
    if (!current || !swap) return;
    fields[index] = swap;
    fields[next] = current;
    setDraft({ ...config, productCard: { ...config.productCard, fields } });
  }

  function toggleField(field: ProductCardField): void {
    const fields = config.productCard.fields.includes(field)
      ? config.productCard.fields.filter((item) => item !== field)
      : [...config.productCard.fields, field];
    if (fields.length === 0) return;
    setDraft({ ...config, productCard: { ...config.productCard, fields } });
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl text-ink">Store</h1>
        <p className="mt-1 text-sm text-ink-soft">What the bot sends, next to the editor.</p>
      </header>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          <details open className="rounded-lg border border-stroke bg-plane p-3">
            <summary className="cursor-pointer text-sm text-ink">Welcome</summary>
            <div className="mt-3 space-y-2">
              <TextAreaField id="store-welcome" label="Welcome text" value={config.welcome} onChange={(event) => setDraft({ ...config, welcome: event.target.value })} />
              <Button variant="ghost" onClick={() => setDraft({ ...config, welcome: loaded.studio.defaults.welcome })}>Reset welcome</Button>
            </div>
          </details>
          <details className="rounded-lg border border-stroke bg-plane p-3">
            <summary className="cursor-pointer text-sm text-ink">Messages</summary>
            <div className="mt-3 space-y-2">
              <TextAreaField id="store-support" label="Support intro" value={config.messages.supportIntro} onChange={(event) => setDraft({ ...config, messages: { ...config.messages, supportIntro: event.target.value } })} />
              <Button variant="ghost" onClick={() => setDraft({ ...config, messages: { ...config.messages, supportIntro: loaded.studio.defaults.messages.supportIntro } })}>Reset support intro</Button>
            </div>
          </details>
          <details className="rounded-lg border border-stroke bg-plane p-3">
            <summary className="cursor-pointer text-sm text-ink">Buttons</summary>
            <ul className="mt-3 space-y-2">
              {BUTTON_KEYS.map((key) => (
                <li key={key} className="flex flex-wrap items-center gap-2">
                  <TextField id={`button-${key}`} label={key} value={config.buttons[key].label} onChange={(event) => setDraft({ ...config, buttons: { ...config.buttons, [key]: { ...config.buttons[key], label: event.target.value } } })} />
                  <SwitchField id={`button-on-${key}`} label="Shown" checked={config.buttons[key].enabled} onChange={(checked) => setDraft({ ...config, buttons: { ...config.buttons, [key]: { ...config.buttons[key], enabled: checked } } })} />
                </li>
              ))}
            </ul>
          </details>
          <details className="rounded-lg border border-stroke bg-plane p-3">
            <summary className="cursor-pointer text-sm text-ink">Product card</summary>
            <div className="mt-3 space-y-2">
              <ul className="space-y-1">
                {config.productCard.fields.map((field, index) => (
                  <li key={field} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                    <span>{field}</span>
                    <Button variant="ghost" onClick={() => moveField(index, -1)}>Move up</Button>
                    <Button variant="ghost" onClick={() => moveField(index, 1)}>Move down</Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_CARD_FIELDS.map((field) => (
                  <SwitchField key={field} id={`card-${field}`} label={field} checked={config.productCard.fields.includes(field)} onChange={() => toggleField(field)} />
                ))}
              </div>
              <SwitchField id="card-image" label="Show image" checked={config.productCard.showImage} onChange={(checked) => setDraft({ ...config, productCard: { ...config.productCard, showImage: checked } })} />
              <TextField id="card-emoji" label="Fallback emoji" value={config.productCard.fallbackEmoji} onChange={(event) => setDraft({ ...config, productCard: { ...config.productCard, fallbackEmoji: event.target.value } })} />
              <Button variant="ghost" onClick={() => setDraft({ ...config, productCard: loaded.studio.defaults.productCard })}>Reset product card</Button>
            </div>
          </details>
          <details className="rounded-lg border border-stroke bg-plane p-3">
            <summary className="cursor-pointer text-sm text-ink">Categories</summary>
            <ul className="mt-3 space-y-2">
              {Object.entries(config.catalog.categories).map(([key, category]) => (
                <li key={key}>
                  <SwitchField id={`category-${key}`} label={category.displayName || key} checked={!category.hidden} onChange={(checked) => setDraft({ ...config, catalog: { ...config.catalog, categories: { ...config.catalog.categories, [key]: { ...category, hidden: !checked } } } })} />
                </li>
              ))}
              {Object.keys(config.catalog.categories).length === 0 ? <li className="text-sm text-ink-soft">No category names have been saved yet.</li> : null}
            </ul>
          </details>
          <details open className="rounded-lg border border-stroke bg-plane p-3">
            <summary className="cursor-pointer text-sm text-ink">Open or closed</summary>
            <div className="mt-3 space-y-2">
              {loaded.statusNeedsMigration ? <p className="text-sm text-ink">Closing the owner store needs migration 0032.</p> : null}
              <SwitchField id="store-open" label={loaded.storeStatus === 'open' ? 'Store is open' : 'Store is in maintenance'} checked={loaded.storeStatus === 'open'} onChange={(checked) => { void runAction('/api/platform/store', { method: 'PATCH', body: { storeStatus: checked ? 'open' : 'maintenance', maintenanceMessage: statusMessage } }).then((result) => { if (!result.ok) setStatusNote(result.error.message); else { setStatusNote(checked ? 'The store is open.' : 'The store is closed.'); store.refetch(); } }); }} />
              <TextAreaField id="store-maintenance" label="Maintenance message" value={statusMessage} onChange={(event) => setStatusMessage(event.target.value)} />
              {statusNote ? <p className="text-sm text-ink-soft">{statusNote}</p> : null}
            </div>
          </details>
          <details className="rounded-lg border border-stroke bg-plane p-3">
            <summary className="cursor-pointer text-sm text-ink">Bot</summary>
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-ink">{loaded.bot.username ? `@${loaded.bot.username}` : 'No bot connected'}</p>
              <p className="text-ink-soft">Status {loaded.bot.status}</p>
              <p className="text-ink-soft">Last health check {loaded.bot.lastHealthAt ? <RelativeTime value={loaded.bot.lastHealthAt} /> : 'never'}</p>
              <TextField id="bot-token" label="Bot token" type="password" value={token} onChange={(event) => setToken(event.target.value)} />
              <Button variant="secondary" onClick={() => { void runAction(loaded.role === 'owner' ? API_ROUTES.ownerSettingsBotConnect : API_ROUTES.botsConnect, { method: 'POST', body: { botToken: token } }).then((result) => { setStatusNote(result.ok ? 'The bot is connected.' : result.error.message); if (result.ok) { setToken(''); store.refetch(); } }); }}>Connect bot</Button>
              <Button variant="secondary" onClick={() => { void runAction('/api/platform/store', { method: 'POST' }).then((result) => { setStatusNote(result.ok ? 'The webhook was registered again.' : result.error.message); store.refetch(); }); }}>Reconnect bot</Button>
            </div>
          </details>
        </div>
        <aside className="space-y-3 lg:sticky lg:top-4">
          <div className="rounded-lg border border-stroke bg-raised p-3">
            <p className="text-sm text-ink">Welcome</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink">{plainBot(welcome)}</pre>
          </div>
          <div className="rounded-lg border border-stroke bg-raised p-3">
            <SelectField id="preview-product" label="Product" value={chosen?.id ?? ''} options={loaded.products.map((product) => ({ value: product.id, label: product.title }))} onChange={(event) => setProductId(event.target.value)} />
            {chosen?.sample ? <p className="mt-2 text-sm text-ink">This store has no products yet. The card below is a sample.</p> : null}
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink">{plainBot(card)}</pre>
          </div>
        </aside>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-stroke bg-plane px-3 py-3">
        <p className="text-sm text-ink">{dirty ? 'Unsaved changes' : 'Saved'}</p>
        {saveError ? <p className="text-sm" style={{ color: 'var(--fault-ink)' }}>{saveError}</p> : null}
        <Button disabled={!dirty} onClick={() => { setSaveError(''); void runAction('/api/platform/store', { method: 'PUT', body: { config, version } }).then((result) => { if (!result.ok) { setSaveError(result.error.message); return; } setDraft(null); store.refetch(); }); }}>Save store</Button>
      </div>
    </section>
  );
}

function plainBot(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
