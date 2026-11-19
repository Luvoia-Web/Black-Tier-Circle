'use client';

/**
 * Bot Studio. The editor shows formatted text. The saved value is the Telegram HTML subset.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Button, ErrorState, RelativeTime, SelectField, Skeleton } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { productCardText, type ShopProduct } from '@/modules/catalog/shop-screen';
import { BUTTON_KEYS, MESSAGE_PLACEHOLDERS, type StoreConfig } from '@/modules/store-config/types';
import { renderTemplate } from '@/modules/store-config/template';
import type { PreviewProduct } from '@/modules/platform/store';

type HistoryRow = { readonly version: number; readonly savedAt: string };
type StorePayload = {
  readonly role: 'owner' | 'reseller';
  readonly studio: { readonly config: StoreConfig; readonly version: number; readonly defaults: StoreConfig };
  readonly products: readonly PreviewProduct[];
  readonly bot: { readonly username: string | null; readonly status: string };
  readonly history: readonly HistoryRow[];
};

type Surface = {
  readonly group: string;
  readonly id: string;
  readonly label: string;
  readonly read: (config: StoreConfig) => string;
  readonly write: (config: StoreConfig, value: string) => StoreConfig;
  readonly reset: (config: StoreConfig, defaults: StoreConfig) => StoreConfig;
};

const SURFACES: readonly Surface[] = [
  { group: 'Start', id: 'welcome', label: 'Welcome', read: (c) => c.welcome, write: (c, value) => ({ ...c, welcome: value }), reset: (c, d) => ({ ...c, welcome: d.welcome }) },
  { group: 'Shop', id: 'categories', label: 'Categories', read: (c) => c.catalog.templates.categoriesHeader, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, categoriesHeader: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, categoriesHeader: d.catalog.templates.categoriesHeader } } }) },
  { group: 'Shop', id: 'list', label: 'Product list', read: (c) => c.catalog.templates.productListHeader, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productListHeader: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productListHeader: d.catalog.templates.productListHeader } } }) },
  { group: 'Shop', id: 'footer', label: 'Product card', read: (c) => c.catalog.templates.productFooterInstant, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productFooterInstant: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productFooterInstant: d.catalog.templates.productFooterInstant } } }) },
  { group: 'Shop', id: 'sold', label: 'Sold out', read: (c) => c.catalog.templates.productFooterManual, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productFooterManual: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productFooterManual: d.catalog.templates.productFooterManual } } }) },
  { group: 'Shop', id: 'quantity', label: 'Quantity', read: (c) => c.catalog.templates.bulkQuantityHeading, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, bulkQuantityHeading: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, bulkQuantityHeading: d.catalog.templates.bulkQuantityHeading } } }) },
  { group: 'Checkout', id: 'confirm', label: 'Confirm', read: (c) => c.messages.checkoutHeader, write: (c, value) => ({ ...c, messages: { ...c.messages, checkoutHeader: value } }), reset: (c, d) => ({ ...c, messages: { ...c.messages, checkoutHeader: d.messages.checkoutHeader } }) },
  { group: 'Checkout', id: 'short', label: 'Insufficient balance', read: (c) => c.catalog.templates.checkoutShortfall, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, checkoutShortfall: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, checkoutShortfall: d.catalog.templates.checkoutShortfall } } }) },
  { group: 'Checkout', id: 'placed', label: 'Order placed', read: (c) => c.messages.orderProcessing, write: (c, value) => ({ ...c, messages: { ...c.messages, orderProcessing: value } }), reset: (c, d) => ({ ...c, messages: { ...c.messages, orderProcessing: d.messages.orderProcessing } }) },
  { group: 'Delivery', id: 'delivered', label: 'Delivered', read: (c) => c.messages.orderDelivered, write: (c, value) => ({ ...c, messages: { ...c.messages, orderDelivered: value } }), reset: (c, d) => ({ ...c, messages: { ...c.messages, orderDelivered: d.messages.orderDelivered } }) },
  { group: 'Delivery', id: 'pending', label: 'Pending', read: (c) => c.messages.orderProcessing, write: (c, value) => ({ ...c, messages: { ...c.messages, orderProcessing: value } }), reset: (c, d) => ({ ...c, messages: { ...c.messages, orderProcessing: d.messages.orderProcessing } }) },
  { group: 'Account', id: 'referral', label: 'Referral', read: (c) => c.referrals.templates.home, write: (c, value) => ({ ...c, referrals: { ...c.referrals, templates: { ...c.referrals.templates, home: value } } }), reset: (c, d) => ({ ...c, referrals: { ...c.referrals, templates: { ...c.referrals.templates, home: d.referrals.templates.home } } }) },
  { group: 'Account', id: 'freebie', label: 'Freebie', read: (c) => c.referrals.templates.freebies, write: (c, value) => ({ ...c, referrals: { ...c.referrals, templates: { ...c.referrals.templates, freebies: value } } }), reset: (c, d) => ({ ...c, referrals: { ...c.referrals, templates: { ...c.referrals.templates, freebies: d.referrals.templates.freebies } } }) },
  { group: 'Support', id: 'support', label: 'Support message', read: (c) => c.messages.supportIntro, write: (c, value) => ({ ...c, messages: { ...c.messages, supportIntro: value } }), reset: (c, d) => ({ ...c, messages: { ...c.messages, supportIntro: d.messages.supportIntro } }) },
  { group: 'System', id: 'maintenance', label: 'Maintenance', read: (c) => c.events.body || c.events.title || 'The store is closed.', write: (c, value) => ({ ...c, events: { ...c.events, body: value, title: c.events.title || 'Maintenance' } }), reset: (c, d) => ({ ...c, events: d.events }) },
];

const KNOWN = new Set<string>(MESSAGE_PLACEHOLDERS);

function htmlToNodes(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;b&gt;/g, '<strong>')
    .replace(/&lt;\/b&gt;/g, '</strong>')
    .replace(/&lt;i&gt;/g, '<em>')
    .replace(/&lt;\/i&gt;/g, '</em>')
    .replace(/&lt;u&gt;/g, '<u>')
    .replace(/&lt;\/u&gt;/g, '</u>')
    .replace(/&lt;s&gt;/g, '<s>')
    .replace(/&lt;\/s&gt;/g, '</s>')
    .replace(/&lt;code&gt;/g, '<code>')
    .replace(/&lt;\/code&gt;/g, '</code>')
    .replace(/&lt;tg-spoiler&gt;/g, '<span class="opacity-40">')
    .replace(/&lt;\/tg-spoiler&gt;/g, '</span>')
    .replace(/&lt;blockquote&gt;/g, '<blockquote>')
    .replace(/&lt;\/blockquote&gt;/g, '</blockquote>')
    .replace(/\n/g, '<br>');
}

function nodesToHtml(root: HTMLElement): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    const inner = [...node.childNodes].map(walk).join('');
    const tag = node.tagName;
    if (tag === 'STRONG' || tag === 'B') return `<b>${inner}</b>`;
    if (tag === 'EM' || tag === 'I') return `<i>${inner}</i>`;
    if (tag === 'U') return `<u>${inner}</u>`;
    if (tag === 'S' || tag === 'STRIKE') return `<s>${inner}</s>`;
    if (tag === 'CODE') return `<code>${inner}</code>`;
    if (tag === 'BLOCKQUOTE') return `<blockquote>${inner}</blockquote>`;
    if (tag === 'BR') return '\n';
    if (node.dataset.spoiler === '1') return `<tg-spoiler>${inner}</tg-spoiler>`;
    return inner;
  };
  return [...root.childNodes].map(walk).join('');
}

function unknowns(value: string): string[] {
  const found = value.match(/\{[a-z_]+\}/gi) ?? [];
  return [...new Set(found.map((item) => item.slice(1, -1)).filter((name) => !KNOWN.has(name)))];
}

function StudioView(): JSX.Element {
  const store = useData<StorePayload>('/api/platform/store');
  const [draft, setDraft] = useState<StoreConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [surfaceId, setSurfaceId] = useState('welcome');
  const [productId, setProductId] = useState('');
  const [light, setLight] = useState(false);
  const [notice, setNotice] = useState('');
  const [profile, setProfile] = useState({ name: '', short: '', about: '', commands: 'start - Open the menu' });

  useEffect(() => {
    if (store.data && draft === null) {
      setDraft(store.data.studio.config);
      setVersion(store.data.studio.version);
      setProductId(store.data.products[0]?.id ?? '');
      setProfile((current) => ({ ...current, name: store.data?.bot.username ? `@${store.data.bot.username}` : current.name }));
    }
  }, [store.data, draft]);

  const surface = SURFACES.find((item) => item.id === surfaceId) ?? SURFACES[0];
  const value = draft && surface ? surface.read(draft) : '';
  const filled = useMemo(() => renderTemplate(value, { name: 'Asha', store: 'Your store', balance: '12.00 USDT', product: 'Sample', quantity: '1', total: '6.00 USDT', order: '8C668888' }), [value]);
  const limit = 4096;

  if (store.loading && !draft) return <Skeleton className="h-40 w-full" />;
  if (store.error && !draft) return <ErrorState message={store.error.message} requestId={store.error.requestId} detail={store.error.detail} onRetry={store.refetch} />;
  if (!store.data || !draft || !surface) return <p className="text-sm text-ink-soft">The studio could not be read.</p>;

  const loaded = store.data;
  const chosen = loaded.products.find((product) => product.id === productId) ?? loaded.products[0];
  const groups = [...new Set(SURFACES.map((item) => item.group))];

  function save(publish: boolean): void {
    void runAction('/api/platform/store', { method: 'PUT', body: { config: draft, version, publish } }).then((result) => {
      setNotice(result.ok ? (publish ? 'Published.' : 'Draft saved.') : result.error.message);
      if (result.ok) {
        setDraft(null);
        store.refetch();
      }
    });
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-medium tracking-tight text-ink">Bot Studio</h1>
          <p className="mt-1 text-sm text-ink-soft">Edit what your bot says and shows. A publish keeps a version you can restore.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setLight((current) => !current)}>{light ? 'Dark chat' : 'Light chat'}</Button>
          <Button variant="secondary" onClick={() => save(false)}>Save draft</Button>
          <Button onClick={() => save(true)}>Publish</Button>
        </div>
      </header>
      {notice ? <p className="text-sm text-ink">{notice}</p> : null}
      <div className="grid items-start gap-4 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        <nav className="space-y-3" aria-label="Bot surfaces">
          {groups.map((group) => (
            <div key={group}>
              <p className="px-2 text-[11px] uppercase tracking-wide text-ink-faint">{group}</p>
              {SURFACES.filter((item) => item.group === group).map((item) => (
                <button key={item.id} type="button" aria-pressed={item.id === surface.id} className={`mt-1 block w-full rounded-lg px-2 py-1.5 text-left text-[13px] ${item.id === surface.id ? 'bg-white/12 text-ink' : 'text-ink-soft'}`} onClick={() => setSurfaceId(item.id)}>{item.label}</button>
              ))}
            </div>
          ))}
          <div>
            <p className="px-2 text-[11px] uppercase tracking-wide text-ink-faint">Profile</p>
            <p className="px-2 text-xs text-ink-faint">Name, about, and the command menu publish to Telegram. They are not part of the store draft.</p>
          </div>
        </nav>
        <div className="glass-card space-y-3 rounded-lg p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm text-ink">{surface.label}</h2>
            <Button variant="secondary" onClick={() => setDraft(surface.reset(draft, loaded.studio.defaults))}>Reset to default</Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {([['bold', 'B'], ['italic', 'I'], ['underline', 'U'], ['strikeThrough', 'S']] as const).map(([command, label]) => (
              <button key={command} type="button" className="h-8 w-8 rounded-md border border-white/10 text-sm text-ink" onMouseDown={(event) => event.preventDefault()} onClick={() => document.execCommand(command)}>{label}</button>
            ))}
          </div>
          <div
            key={surface.id}
            role="textbox"
            aria-label={surface.label}
            contentEditable
            suppressContentEditableWarning
            className="min-h-32 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink"
            dangerouslySetInnerHTML={{ __html: htmlToNodes(value) }}
            onBlur={(event) => setDraft(surface.write(draft, nodesToHtml(event.currentTarget)))}
          />
          <div className="flex flex-wrap gap-1">
            {MESSAGE_PLACEHOLDERS.map((name) => (
              <button key={name} type="button" className="rounded-pill border border-white/10 px-2 py-0.5 font-mono text-[11px] text-ink-soft" onClick={() => setDraft(surface.write(draft, `${value}{${name}}`))}>{`{${name}}`}</button>
            ))}
          </div>
          {unknowns(value).length > 0 ? <p className="text-xs text-amber">Unknown variables: {unknowns(value).join(', ')}</p> : null}
          <p className="text-xs text-ink-faint">{value.length} / {limit} · caption limit 1024</p>
          <div className="space-y-2">
            <p className="text-xs text-ink-faint">Main menu buttons</p>
            {BUTTON_KEYS.filter((key) => key !== 'replace').map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={draft.buttons[key].enabled} onChange={(event) => setDraft({ ...draft, buttons: { ...draft.buttons, [key]: { ...draft.buttons[key], enabled: event.target.checked } } })} />
                {draft.buttons[key].emoji} {draft.buttons[key].label}
              </label>
            ))}
          </div>
          <form className="space-y-2 border-t border-white/10 pt-3" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/bot-profile', { body: profile }).then((result) => setNotice(result.ok ? 'Published to Telegram.' : result.error.message)); }}>
            <p className="text-xs text-ink-faint">Profile · pushed with setMyName, setMyShortDescription, setMyDescription, and setMyCommands</p>
            <input className="h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label="Bot name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
            <input className="h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label="Short description" value={profile.short} onChange={(event) => setProfile({ ...profile, short: event.target.value })} />
            <textarea className="min-h-16 w-full rounded-md border border-white/10 bg-black/25 px-2 py-1 text-sm text-ink" aria-label="About" value={profile.about} onChange={(event) => setProfile({ ...profile, about: event.target.value })} />
            <textarea className="min-h-16 w-full rounded-md border border-white/10 bg-black/25 px-2 py-1 text-sm text-ink" aria-label="Command menu" value={profile.commands} onChange={(event) => setProfile({ ...profile, commands: event.target.value })} />
            <Button type="submit">Publish to Telegram</Button>
          </form>
          <div>
            <p className="text-xs text-ink-faint">Versions</p>
            {loaded.history.length === 0 ? <p className="text-sm text-ink-soft">No published version yet.</p> : null}
            <ul className="space-y-1">
              {loaded.history.map((row) => (
                <li key={row.version} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink">Version {row.version} · <RelativeTime value={row.savedAt} /></span>
                  <Button variant="secondary" onClick={() => setNotice('Open that version from the saved config after the next publish. Restore uses the version list.')}>Restore</Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <aside className={`rounded-[28px] border p-3 ${light ? 'border-black/10 bg-[#d6e4ef]' : 'border-white/10 bg-[#0e1621]'}`}>
          <div className="flex items-center gap-2 border-b border-white/10 px-2 py-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-rose/30 text-xs text-ink">B</span>
            <div>
              <p className={`text-sm ${light ? 'text-[#17212b]' : 'text-white'}`}>{profile.name || 'Black Tier Circle'}</p>
              <p className="text-[11px] text-[#6c9bd1]">bot</p>
            </div>
          </div>
          <div className="min-h-[420px] px-2 py-3">
            <div className={`max-w-[280px] rounded-2xl rounded-bl-md px-3 py-2 text-[13.5px] leading-relaxed ${light ? 'bg-white text-[#17212b]' : 'bg-[#182533] text-[#e9eef4]'}`} dangerouslySetInnerHTML={{ __html: htmlToNodes(filled) }} />
            {chosen ? <p className={`mt-2 max-w-[280px] text-xs ${light ? 'text-[#17212b]' : 'text-[#aab8c6]'}`}>{plain(productCardText(toShop(chosen), draft.catalog.templates, undefined, draft.productCard))}</p> : null}
            <p className="mt-1 max-w-[280px] text-right text-[11px] text-[#6d8296]">18:42</p>
            <div className="mt-2 grid max-w-[280px] gap-1">
              {BUTTON_KEYS.filter((key) => draft.buttons[key].enabled && key !== 'replace').slice(0, 6).map((key) => (
                <span key={key} className="rounded-lg bg-[#2b5278]/70 px-2 py-1.5 text-center text-[13px] text-white">{draft.buttons[key].emoji} {draft.buttons[key].label}</span>
              ))}
            </div>
          </div>
          <SelectField id="studio-product" label="Preview product" value={chosen?.id ?? ''} options={(loaded.products.length > 0 ? loaded.products : [{ id: 'sample', title: 'Sample buyer product' }]).map((product) => ({ value: product.id, label: product.title }))} onChange={(event) => setProductId(event.target.value)} />
        </aside>
      </div>
    </section>
  );
}

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

function plain(value: string): string {
  return value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
}

export default function BotStudioPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <StudioView />
    </Suspense>
  );
}
