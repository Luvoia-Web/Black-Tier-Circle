'use client';

/**
 * Bot Studio. Tabs match the product mockup. The saved value is the Telegram HTML subset.
 */

import { productInitials } from '@/lib/product-labels';
import { ownerBotDisplayName } from '@/lib/owner-bot';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GripVertical } from 'lucide-react';
import { Button, ErrorState, RelativeTime, SelectField, Skeleton } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { formatUsdt } from '@/lib/money';
import { productCardText, type ShopProduct } from '@/modules/catalog/shop-screen';
import type { PreviewProduct } from '@/modules/platform/store';
import { layoutHomeButtons } from '@/modules/store-config/keyboard';
import { BUTTON_KEYS, MESSAGE_PLACEHOLDERS, PRODUCT_CARD_FIELDS, type ButtonKey, type ProductCardField, type StoreConfig } from '@/modules/store-config/types';
import { renderTemplate } from '@/modules/store-config/template';

type HistoryRow = { readonly version: number; readonly savedAt: string };
type StorePayload = {
  readonly role: 'owner' | 'reseller';
  readonly studio: { readonly config: StoreConfig; readonly version: number; readonly defaults: StoreConfig };
  readonly products: readonly PreviewProduct[];
  readonly bot: { readonly username: string | null; readonly status: string };
  readonly history: readonly HistoryRow[];
  readonly testChat: { readonly chatId: string | null; readonly needsMigration: boolean };
  readonly menuToggles?: { readonly resellerSignup: boolean; readonly myApi: boolean };
};

type Surface = {
  readonly section: string;
  readonly id: string;
  readonly label: string;
  readonly read: (config: StoreConfig) => string;
  readonly write: (config: StoreConfig, value: string) => StoreConfig;
  readonly reset: (config: StoreConfig, defaults: StoreConfig) => StoreConfig;
};

const SECTIONS = [
  { id: 'home', label: 'Home' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'card', label: 'Product card' },
  { id: 'messages', label: 'Messages' },
  { id: 'links', label: 'Links' },
  { id: 'checkout', label: 'Checkout' },
] as const;

const SURFACES: readonly Surface[] = [
  { section: 'home', id: 'welcome', label: 'Welcome', read: (c) => c.welcome, write: (c, value) => ({ ...c, welcome: value }), reset: (c, d) => ({ ...c, welcome: d.welcome }) },
  { section: 'catalogue', id: 'categories', label: 'Categories', read: (c) => c.catalog.templates.categoriesHeader, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, categoriesHeader: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, categoriesHeader: d.catalog.templates.categoriesHeader } } }) },
  { section: 'catalogue', id: 'list', label: 'Product list', read: (c) => c.catalog.templates.productListHeader, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productListHeader: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productListHeader: d.catalog.templates.productListHeader } } }) },
  { section: 'card', id: 'footer', label: 'Card footer', read: (c) => c.catalog.templates.productFooterInstant, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productFooterInstant: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productFooterInstant: d.catalog.templates.productFooterInstant } } }) },
  { section: 'messages', id: 'sold', label: 'Sold out', read: (c) => c.catalog.templates.productFooterManual, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productFooterManual: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, productFooterManual: d.catalog.templates.productFooterManual } } }) },
  { section: 'messages', id: 'quantity', label: 'Quantity', read: (c) => c.catalog.templates.bulkQuantityHeading, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, bulkQuantityHeading: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, bulkQuantityHeading: d.catalog.templates.bulkQuantityHeading } } }) },
  { section: 'checkout', id: 'confirm', label: 'Confirm', read: (c) => c.messages.checkoutHeader, write: (c, value) => ({ ...c, messages: { ...c.messages, checkoutHeader: value } }), reset: (c, d) => ({ ...c, messages: { ...c.messages, checkoutHeader: d.messages.checkoutHeader } }) },
  { section: 'checkout', id: 'short', label: 'Insufficient balance', read: (c) => c.catalog.templates.checkoutShortfall, write: (c, value) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, checkoutShortfall: value } } }), reset: (c, d) => ({ ...c, catalog: { ...c.catalog, templates: { ...c.catalog.templates, checkoutShortfall: d.catalog.templates.checkoutShortfall } } }) },
  { section: 'checkout', id: 'placed', label: 'Order placed', read: (c) => c.messages.orderProcessing, write: (c, value) => ({ ...c, messages: { ...c.messages, orderProcessing: value } }), reset: (c, d) => ({ ...c, messages: { ...c.messages, orderProcessing: d.messages.orderProcessing } }) },
  { section: 'messages', id: 'delivered', label: 'Delivered', read: (c) => c.messages.orderDelivered, write: (c, value) => ({ ...c, messages: { ...c.messages, orderDelivered: value } }), reset: (c, d) => ({ ...c, messages: { ...c.messages, orderDelivered: d.messages.orderDelivered } }) },
  { section: 'messages', id: 'referral', label: 'Referral', read: (c) => c.referrals.templates.home, write: (c, value) => ({ ...c, referrals: { ...c.referrals, templates: { ...c.referrals.templates, home: value } } }), reset: (c, d) => ({ ...c, referrals: { ...c.referrals, templates: { ...c.referrals.templates, home: d.referrals.templates.home } } }) },
  { section: 'messages', id: 'freebie', label: 'Freebie', read: (c) => c.referrals.templates.freebies, write: (c, value) => ({ ...c, referrals: { ...c.referrals, templates: { ...c.referrals.templates, freebies: value } } }), reset: (c, d) => ({ ...c, referrals: { ...c.referrals, templates: { ...c.referrals.templates, freebies: d.referrals.templates.freebies } } }) },
  { section: 'messages', id: 'support', label: 'Support message', read: (c) => c.messages.supportIntro, write: (c, value) => ({ ...c, messages: { ...c.messages, supportIntro: value } }), reset: (c, d) => ({ ...c, messages: { ...c.messages, supportIntro: d.messages.supportIntro } }) },
  { section: 'messages', id: 'maintenance', label: 'Maintenance', read: (c) => c.events.body || c.events.title || 'The store is closed.', write: (c, value) => ({ ...c, events: { ...c.events, body: value, title: c.events.title || 'Maintenance' } }), reset: (c, d) => ({ ...c, events: d.events }) },
];

const DEFAULT_SURFACE: Record<string, string> = {
  home: 'welcome',
  catalogue: 'categories',
  card: 'footer',
  messages: 'delivered',
  checkout: 'confirm',
};

const EMOJIS = ['👋', '🛍️', '⚡', '✅', '⏳', '💳', '🏠', '🎁', '👤', '❓', '📦', '🔥', '💰', '🎉', '🔑', '✨', '⭐', '💬', '📢', '🔒'] as const;

const CARD_COPY: Record<ProductCardField | 'image', { readonly label: string; readonly hint: string }> = {
  image: { label: 'Product image', hint: 'Fallback emoji when the photo is missing' },
  name: { label: 'Name', hint: 'Always shown' },
  price: { label: 'Price', hint: 'With bulk discount when the quantity qualifies' },
  duration: { label: 'Duration', hint: 'From the supplier, for example 30 days' },
  warranty: { label: 'Warranty', hint: 'For example 7 days replacement' },
  stock: { label: 'Stock', hint: 'Shows unlimited when the product has no cap' },
  sold: { label: 'Sold count', hint: 'Social proof, such as 214 sold' },
  type: { label: 'Type', hint: 'How the item is delivered' },
};

const SURFACE_PLACEHOLDERS: Readonly<Record<string, readonly string[]>> = {
  welcome: ['name', 'store', 'balance', 'channel', 'group', 'website'],
  categories: ['store'],
  list: ['emoji', 'name', 'description', 'count'],
  footer: ['store', 'product', 'price', 'duration', 'stock'],
  sold: ['store', 'product', 'duration', 'stock'],
  quantity: ['product', 'price', 'stock'],
  confirm: ['name', 'store', 'product', 'quantity', 'total', 'balance'],
  short: ['shortfall', 'total', 'balance'],
  placed: ['name', 'store', 'product', 'quantity', 'total', 'order'],
  delivered: ['name', 'store', 'product', 'quantity', 'total', 'balance', 'order', 'content'],
  referral: ['name', 'store', 'points', 'amount'],
  freebie: ['name', 'store'],
  support: ['name', 'store', 'order'],
  maintenance: ['name', 'store'],
};

const KNOWN = new Set<string>([
  ...MESSAGE_PLACEHOLDERS,
  'emoji',
  'description',
  'count',
  'shortfall',
  'min',
  'price',
  'qty',
  'unit',
  'savings',
  'points',
  'amount',
  'duration',
  'stock',
]);

function linkPreviewLine(link: { readonly label: string; readonly url: string }): string {
  const url = link.url.trim();
  if (!url) return '';
  const label = link.label.trim() || 'Link';
  return `${label}: ${url}`;
}

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

function hydrate(config: StoreConfig): StoreConfig {
  const buttons = { ...config.buttons };
  for (const key of BUTTON_KEYS) {
    const button = buttons[key];
    if (!button) continue;
    buttons[key] = { ...button, action: button.action ?? 'section', target: button.target ?? '' };
  }
  return { ...config, buttons, images: config.images ?? {} };
}

function money(value: string): string {
  try {
    return formatUsdt(BigInt(value));
  } catch {
    return '0.00 USDT';
  }
}

function StudioView(): JSX.Element {
  const params = useSearchParams();
  const router = useRouter();
  const store = useData<StorePayload>('/api/platform/store');
  const [draft, setDraft] = useState<StoreConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [tick, setTick] = useState(0);
  const [productId, setProductId] = useState('');
  const [light, setLight] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [emojiFor, setEmojiFor] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [chatId, setChatId] = useState('');
  const [profile, setProfile] = useState({ name: '', short: '', about: '', commands: 'start - Open the menu' });
  const [dragKey, setDragKey] = useState('');

  useEffect(() => {
    if (store.data && draft === null) {
      setDraft(hydrate(store.data.studio.config));
      setVersion(store.data.studio.version);
      setProductId(store.data.products[0]?.id ?? '');
      setChatId(store.data.testChat.chatId ?? '');
      setProfile((current) => ({ ...current, name: store.data?.bot.username ? store.data.bot.username : current.name }));
    }
  }, [store.data, draft]);

  const section = params.get('section') || 'card';
  const surfaceId = params.get('surface') || DEFAULT_SURFACE[section] || 'welcome';
  const surface = SURFACES.find((item) => item.id === surfaceId) ?? SURFACES.find((item) => item.section === section) ?? SURFACES[0];

  function openSection(next: string, nextSurface?: string): void {
    const query = new URLSearchParams(params.toString());
    query.set('section', next);
    if (nextSurface) query.set('surface', nextSurface);
    else query.delete('surface');
    router.replace(`/bot-studio?${query.toString()}`);
    setEmojiFor(null);
  }

  const value = draft && surface ? surface.read(draft) : '';
  const image = draft?.images?.[surface?.id ?? ''] ?? '';
  const limit = image ? 1024 : 4096;

  const chosen = store.data?.products.find((product) => product.id === productId) ?? store.data?.products[0];
  const filled = useMemo(() => {
    if (!draft || !surface) return '';
    return renderTemplate(surface.read(draft), {
      name: surface.id === 'list' ? 'Streaming' : 'Asha',
      emoji: '🎬',
      description: 'Instant digital subscriptions.',
      count: String(store.data?.products.length ?? 4),
      store: ownerBotDisplayName(store.data?.bot.username),
      balance: '12.00 USDT',
      product: chosen?.title ?? 'Sample',
      quantity: '1',
      total: chosen ? money(chosen.priceMinor) : '6.00 USDT',
      order: '8C668888',
      price: chosen ? money(chosen.priceMinor) : '6.00 USDT',
      shortfall: '2.00 USDT',
      stock: chosen?.stockUnlimited ? 'unlimited' : String(chosen?.stockCount ?? 0),
      duration: chosen?.durationText ?? '30 days',
      points: '5',
      amount: '1.00 USDT',
      content: 'your item',
      channel: linkPreviewLine(draft.links.channel),
      group: linkPreviewLine(draft.links.group),
      website: linkPreviewLine(draft.links.website),
    });
  }, [draft, surface, chosen, store.data?.bot.username, store.data?.products.length]);

  if (store.loading && !draft) return <Skeleton className="h-40 w-full" />;
  if (store.error && !draft) return <ErrorState message={store.error.message} requestId={store.error.requestId} detail={store.error.detail} onRetry={store.refetch} />;
  if (!store.data || !draft || !surface) return <p className="text-sm text-ink-soft">The studio could not be read.</p>;

  const loaded = store.data;
  const config = draft;
  const active = surface;
  const dirty = JSON.stringify(config) !== JSON.stringify(hydrate(loaded.studio.config));
  const sectionSurfaces = SURFACES.filter((item) => item.section === section);
  const surfacePlaceholders = SURFACE_PLACEHOLDERS[active.id] ?? ['name', 'store'];
  const ownerResellerSignup = loaded.menuToggles?.resellerSignup ?? false;
  const ownerMyApi = loaded.menuToggles?.myApi ?? false;
  const rows = layoutHomeButtons(config, {
    resellerSignupEnabled: loaded.role === 'owner' ? ownerResellerSignup : ownerResellerSignup && config.buttons.reseller_signup.enabled,
    myApiEnabled: ownerMyApi,
  });

  function writeSurface(next: string): void {
    setDraft(active.write(config, next));
    setTick((current) => current + 1);
  }

  function save(publish: boolean): void {
    if (value.length > limit) {
      setNotice(image ? 'A message with an image can be 1024 characters.' : 'A message can be 4096 characters.');
      return;
    }
    void runAction('/api/platform/store', { method: 'PUT', body: { config, version, publish } }).then((result) => {
      setNotice(result.ok ? (publish ? 'Published.' : 'Draft saved.') : result.error.message);
      if (result.ok) {
        setDraft(null);
        store.refetch();
      }
    });
  }

  function setImage(url: string): void {
    setDraft({ ...config, images: { ...config.images, [active.id]: url } });
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-medium tracking-tight text-ink">Bot Studio</h1>
          <p className="mt-1 text-sm text-ink-soft">Edit what your bot says and shows. Changes go live about 30 seconds after you publish.</p>
        </div>
        <div className="flex gap-2">
          {loaded.bot.username ? <a className="inline-flex h-[38px] items-center rounded-xl border border-white/12 px-3 text-[13.5px] text-ink" href={`https://t.me/${loaded.bot.username}`} target="_blank" rel="noreferrer">Open bot</a> : <span className="text-sm text-ink-faint">No bot username yet</span>}
          <Button variant="secondary" onClick={() => setHistoryOpen((current) => !current)}>Versions</Button>
        </div>
      </header>
      {notice ? <p className="text-sm text-ink">{notice}</p> : null}
      <div className="inline-flex flex-wrap rounded-xl border border-white/10 bg-black/25 p-1" role="tablist" aria-label="Bot Studio">
        {SECTIONS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={section === item.id} className={`h-8 rounded-lg px-3 text-[12.5px] ${section === item.id ? 'bg-white/12 text-ink' : 'text-ink-faint'}`} onClick={() => openSection(item.id, DEFAULT_SURFACE[item.id])}>{item.label}</button>
        ))}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          {sectionSurfaces.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Message">
              {sectionSurfaces.map((item) => (
                <button key={item.id} type="button" role="tab" aria-selected={item.id === surface.id} className={`h-8 rounded-lg px-3 text-[12.5px] ${item.id === surface.id ? 'bg-white/12 text-ink' : 'text-ink-faint'}`} onClick={() => openSection(section, item.id)}>{item.label}</button>
              ))}
            </div>
          ) : null}
          {section === 'buttons' ? <ButtonEditor draft={draft} setDraft={setDraft} role={loaded.role} menuToggles={{ resellerSignup: ownerResellerSignup, myApi: ownerMyApi }} emojiFor={emojiFor} setEmojiFor={setEmojiFor} dragKey={dragKey} setDragKey={setDragKey} /> : null}
          {section === 'links' ? <LinksEditor draft={draft} setDraft={setDraft} /> : null}
          {section === 'card' ? <CardEditor draft={draft} setDraft={setDraft} dragKey={dragKey} setDragKey={setDragKey} /> : null}
          {section !== 'buttons' && section !== 'links' && surface.section === section ? (
            <article className="glass-card space-y-3 rounded-lg p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm text-ink">{surface.label}</h2>
                <Button variant="secondary" onClick={() => { setDraft(surface.reset(draft, loaded.studio.defaults)); setTick((current) => current + 1); }}>Reset to default</Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {([['bold', 'B'], ['italic', 'I'], ['underline', 'U'], ['strikeThrough', 'S']] as const).map(([command, label]) => (
                  <button key={command} type="button" className="h-8 w-8 rounded-md border border-white/10 text-sm text-ink" onMouseDown={(event) => event.preventDefault()} onClick={() => document.execCommand(command)}>{label}</button>
                ))}
                <Button variant="secondary" onClick={() => setEmojiFor(emojiFor === 'message' ? null : 'message')}>Emoji</Button>
              </div>
              {emojiFor === 'message' ? <EmojiGrid onPick={(emoji) => writeSurface(`${value}${emoji}`)} /> : null}
              <div
                key={`${surface.id}:${tick}`}
                role="textbox"
                aria-label={surface.label}
                contentEditable
                suppressContentEditableWarning
                className="min-h-32 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink"
                dangerouslySetInnerHTML={{ __html: htmlToNodes(value) }}
                onBlur={(event) => setDraft(surface.write(draft, nodesToHtml(event.currentTarget)))}
              />
              <div className="flex flex-wrap items-center gap-1">
                {surfacePlaceholders.map((name) => (
                  <button key={name} type="button" className="rounded-pill border border-white/10 px-2 py-0.5 font-mono text-[11px] text-ink-soft" onClick={() => writeSurface(`${value}{${name}}`)}>{`{${name}}`}</button>
                ))}
                <span className="text-[11px] text-ink-faint">tap to insert</span>
              </div>
              {unknowns(value).length > 0 ? <p className="text-xs text-amber">Unknown variables: {unknowns(value).join(', ')}</p> : null}
              <label className="block text-xs text-ink-faint">
                Image for this message
                <input className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label="Image for this message" value={image} placeholder="https://" onChange={(event) => setImage(event.target.value.trim())} />
              </label>
              <p className={`text-xs ${value.length > limit ? 'text-amber' : 'text-ink-faint'}`}>{value.length} / {limit}</p>
              {section === 'home' ? (
                <form className="space-y-2 border-t border-white/10 pt-3" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/bot-profile', { body: profile }).then((result) => setNotice(result.ok ? 'Published to Telegram.' : result.error.message)); }}>
                  <p className="text-xs text-ink-faint">Name, about, and the command menu publish with setMyName, setMyShortDescription, setMyDescription, and setMyCommands.</p>
                  <input className="h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label="Bot name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
                  <input className="h-9 w-full rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label="Short description" value={profile.short} onChange={(event) => setProfile({ ...profile, short: event.target.value })} />
                  <textarea className="min-h-16 w-full rounded-md border border-white/10 bg-black/25 px-2 py-1 text-sm text-ink" aria-label="About" value={profile.about} onChange={(event) => setProfile({ ...profile, about: event.target.value })} />
                  <textarea className="min-h-16 w-full rounded-md border border-white/10 bg-black/25 px-2 py-1 text-sm text-ink" aria-label="Command menu" value={profile.commands} onChange={(event) => setProfile({ ...profile, commands: event.target.value })} />
                  <Button type="submit">Publish to Telegram</Button>
                </form>
              ) : null}
            </article>
          ) : null}
          {historyOpen ? (
            <article className="glass-card space-y-2 rounded-lg p-4">
              <h2 className="text-sm text-ink">Versions</h2>
              {loaded.history.length === 0 ? <p className="text-sm text-ink-soft">No published version yet.</p> : null}
              <ul className="space-y-1">
                {loaded.history.map((row) => (
                  <li key={row.version} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink">Version {row.version} · <RelativeTime value={row.savedAt} /></span>
                    <Button variant="secondary" onClick={() => {
                      void runAction<{ config: StoreConfig }>(`/api/platform/store?version=${row.version}`, { method: 'GET' }).then((result) => {
                        if (!result.ok || !result.data.config) {
                          setNotice(result.ok ? 'That version had no config.' : result.error.message);
                          return;
                        }
                        setDraft(hydrate(result.data.config));
                        setTick((current) => current + 1);
                        setNotice(`Version ${row.version} is in the editor. Publish it to make it the live copy.`);
                      });
                    }}>Load this version</Button>
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
          <form className="glass-card flex flex-wrap items-end gap-2 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction('/api/platform/bot-studio/test', { body: { text: filled || value, imageUrl: image, chatId } }).then((result) => setNotice(result.ok ? 'Sent to your Telegram.' : result.error.message)); }}>
            <label className="text-xs text-ink-faint">
              Your Telegram chat id
              <input className="mt-1 h-9 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label="Your Telegram chat id" value={chatId} onChange={(event) => setChatId(event.target.value)} />
            </label>
            <Button type="submit" disabled={!/^-?\d{5,20}$/.test(chatId.trim())}>Send test to my Telegram</Button>
          </form>
        </div>
        <Preview light={light} setLight={setLight} draft={draft} filled={filled} chosen={chosen} productId={productId} products={loaded.products} rows={rows} section={section} image={image || (section === 'card' ? chosen?.imageUrl ?? '' : '')} onProduct={setProductId} />
      </div>
      {dirty ? (
        <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/14 bg-[rgb(30_16_24/0.92)] px-4 py-2.5">
          <span className="text-sm text-ink">You have unsaved changes in {SECTIONS.find((item) => item.id === section)?.label}</span>
          <span className="flex-1" />
          <Button variant="secondary" onClick={() => { setDraft(hydrate(loaded.studio.config)); setTick((current) => current + 1); }}>Discard</Button>
          <Button onClick={() => save(true)}>Save and publish</Button>
        </div>
      ) : null}
    </section>
  );
}

function EmojiGrid({ onPick }: { readonly onPick: (emoji: string) => void }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {EMOJIS.map((emoji) => (
        <button key={emoji} type="button" className="h-8 w-8 rounded-md border border-white/10 text-base" onClick={() => onPick(emoji)}>{emoji}</button>
      ))}
    </div>
  );
}

function ButtonEditor({ draft, setDraft, role, menuToggles, emojiFor, setEmojiFor, dragKey, setDragKey }: {
  readonly draft: StoreConfig;
  readonly setDraft: (next: StoreConfig) => void;
  readonly role: 'owner' | 'reseller';
  readonly menuToggles: { readonly resellerSignup: boolean; readonly myApi: boolean };
  readonly emojiFor: string | null;
  readonly setEmojiFor: (next: string | null) => void;
  readonly dragKey: string;
  readonly setDragKey: (next: string) => void;
}): JSX.Element {
  const keys = BUTTON_KEYS
    .filter((key): key is Exclude<ButtonKey, 'replace'> => key !== 'replace')
    .filter((key) => role === 'owner' || (key !== 'reseller_signup' && key !== 'api'))
    .slice()
    .sort((left, right) => draft.buttons[left].order - draft.buttons[right].order);
  function patch(key: Exclude<ButtonKey, 'replace'>, partial: Partial<StoreConfig['buttons'][ButtonKey]>): void {
    setDraft({ ...draft, buttons: { ...draft.buttons, [key]: { ...draft.buttons[key], ...partial } } });
  }
  function dropOn(key: Exclude<ButtonKey, 'replace'>): void {
    if (!dragKey || dragKey === key || dragKey === 'replace') return;
    const moving = dragKey as Exclude<ButtonKey, 'replace'>;
    const order = keys.filter((item) => item !== moving);
    const index = order.indexOf(key);
    order.splice(index, 0, moving);
    const buttons = { ...draft.buttons };
    order.forEach((item, position) => {
      buttons[item] = { ...buttons[item], order: position };
    });
    setDraft({ ...draft, buttons });
    setDragKey('');
  }
  return (
    <article className="glass-card space-y-3 rounded-lg p-4">
      <div>
        <h2 className="text-sm text-ink">Menu buttons</h2>
        <p className="text-xs text-ink-faint">Drag to reorder. A row holds one full-width button or two half-width buttons. Telegram allows at most 8 buttons on a row. Buyers cannot request a replacement from the bot.</p>
      </div>
      {keys.map((key) => {
        const button = draft.buttons[key];
        const ownerControlled = key === 'reseller_signup' || key === 'api';
        const ownerOn = key === 'reseller_signup' ? menuToggles.resellerSignup : menuToggles.myApi;
        const checked = ownerControlled ? ownerOn : button.enabled;
        return (
          <div key={key} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-3" draggable onDragStart={() => setDragKey(key)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(key)}>
            <div className="flex flex-wrap items-center gap-2">
              <GripVertical className="h-4 w-4 text-ink-faint" aria-hidden="true" />
              <button type="button" className="h-8 min-w-8 rounded-md border border-white/10 px-2 text-sm" onClick={() => setEmojiFor(emojiFor === key ? null : key)}>{button.emoji || 'Emoji'}</button>
              <input className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label={`${key} label`} value={button.label} onChange={(event) => patch(key, { label: event.target.value })} />
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <input type="checkbox" disabled={ownerControlled} checked={checked} onChange={(event) => patch(key, { enabled: event.target.checked })} />
                {ownerControlled ? `Owner toggle (${ownerOn ? 'On' : 'Off'} in Settings)` : 'Shown'}
              </label>
            </div>
            {emojiFor === key ? <EmojiGrid onPick={(emoji) => { patch(key, { emoji }); setEmojiFor(null); }} /> : null}
            <div className="flex flex-wrap gap-2">
              <select className="h-8 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label={`${key} action`} value={button.action} onChange={(event) => patch(key, { action: event.target.value as StoreConfig['buttons'][ButtonKey]['action'] })}>
                <option value="section">Section</option>
                <option value="url">URL</option>
                <option value="support">Support</option>
              </select>
              <select className="h-8 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label={`${key} row`} value={button.width} onChange={(event) => patch(key, { width: event.target.value === 'half' ? 'half' : 'full' })}>
                <option value="full">Own row</option>
                <option value="half">Share a row</option>
              </select>
              {button.action === 'url' ? <input className="h-8 min-w-[180px] flex-1 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label={`${key} url`} value={button.target} placeholder="https://" onChange={(event) => patch(key, { target: event.target.value })} /> : null}
            </div>
          </div>
        );
      })}
    </article>
  );
}

function CardEditor({ draft, setDraft, dragKey, setDragKey }: {
  readonly draft: StoreConfig;
  readonly setDraft: (next: StoreConfig) => void;
  readonly dragKey: string;
  readonly setDragKey: (next: string) => void;
}): JSX.Element {
  const fields = draft.productCard.fields.filter((field): field is Exclude<ProductCardField, 'image'> => field !== 'image');
  const editable = PRODUCT_CARD_FIELDS.filter((field): field is Exclude<ProductCardField, 'image'> => field !== 'image');
  const enabled = editable.filter((field) => fields.includes(field));
  const disabled = editable.filter((field) => !fields.includes(field));
  const order = ['image' as const, ...enabled, ...disabled];
  function toggle(field: Exclude<ProductCardField, 'image'>): void {
    if (field === 'name') return;
    const next = fields.includes(field) ? fields.filter((item) => item !== field) : [...fields, field];
    setDraft({ ...draft, productCard: { ...draft.productCard, fields: next.length > 0 ? next : ['name'] } });
  }
  function dropOn(field: string): void {
    if (!dragKey || dragKey === 'image' || field === 'image' || dragKey === field) return;
    const moving = dragKey as Exclude<ProductCardField, 'image'>;
    const next = fields.filter((item) => item !== moving);
    const index = next.indexOf(field as Exclude<ProductCardField, 'image'>);
    next.splice(index < 0 ? next.length : index, 0, moving);
    setDraft({ ...draft, productCard: { ...draft.productCard, fields: next } });
    setDragKey('');
  }
  return (
    <article className="glass-card space-y-2 rounded-lg p-4">
      <h2 className="text-sm text-ink">Card layout</h2>
      <p className="text-xs text-ink-faint">Drag to reorder what a buyer sees on a product.</p>
      {order.map((field) => {
        const copy = CARD_COPY[field];
        const on = field === 'image' ? draft.productCard.showImage : fields.includes(field);
        return (
          <div key={field} className="flex items-center gap-3 rounded-[13px] border border-white/10 bg-white/[0.04] px-3 py-2" draggable={field !== 'image'} onDragStart={() => setDragKey(field)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(field)}>
            <GripVertical className="h-4 w-4 text-ink-faint" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] text-ink">{copy.label}</p>
              <p className="text-xs text-ink-faint">{copy.hint}</p>
            </div>
            <button type="button" aria-pressed={on} disabled={field === 'name'} className={`relative h-[22px] w-[38px] rounded-full ${on ? 'bg-rose' : 'bg-white/12'}`} onClick={() => { if (field === 'image') setDraft({ ...draft, productCard: { ...draft.productCard, showImage: !draft.productCard.showImage } }); else toggle(field); }}>
              <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white ${on ? 'right-[3px]' : 'left-[3px]'}`} />
            </button>
          </div>
        );
      })}
    </article>
  );
}

function LinksEditor({ draft, setDraft }: { readonly draft: StoreConfig; readonly setDraft: (next: StoreConfig) => void }): JSX.Element {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  function link(key: 'channel' | 'group' | 'website', field: 'label' | 'url', value: string): void {
    setDraft({ ...draft, links: { ...draft.links, [key]: { ...draft.links[key], [field]: value } } });
  }
  return (
    <article className="glass-card space-y-3 rounded-lg p-4">
      <h2 className="text-sm text-ink">Links</h2>
      {(['channel', 'group', 'website'] as const).map((key) => (
        <div key={key} className="grid gap-2 sm:grid-cols-2">
          <input className="h-9 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label={`${key} label`} value={draft.links[key].label} onChange={(event) => link(key, 'label', event.target.value)} />
          <input className="h-9 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label={`${key} url`} value={draft.links[key].url} onChange={(event) => link(key, 'url', event.target.value)} />
        </div>
      ))}
      <ul className="space-y-1">
        {draft.customLinks.map((item) => (
          <li key={`${item.label}-${item.url}`} className="flex items-center justify-between gap-2 text-sm text-ink">
            <span>{item.emoji} {item.label}</span>
            <Button variant="secondary" onClick={() => setDraft({ ...draft, customLinks: draft.customLinks.filter((link) => link.url !== item.url) })}>Remove link</Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input className="h-9 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label="Custom link label" value={label} onChange={(event) => setLabel(event.target.value)} />
        <input className="h-9 min-w-[180px] flex-1 rounded-md border border-white/10 bg-black/25 px-2 text-sm text-ink" aria-label="Custom link url" value={url} onChange={(event) => setUrl(event.target.value)} />
        <Button variant="secondary" disabled={label.trim().length === 0 || url.trim().length < 8 || draft.customLinks.length >= 3} onClick={() => { setDraft({ ...draft, customLinks: [...draft.customLinks, { label: label.trim(), url: url.trim(), emoji: '🔗' }] }); setLabel(''); setUrl(''); }}>Add link</Button>
      </div>
    </article>
  );
}

function Preview({ light, setLight, draft, filled, chosen, productId, products, rows, section, image, onProduct }: {
  readonly light: boolean;
  readonly setLight: (next: boolean) => void;
  readonly draft: StoreConfig;
  readonly filled: string;
  readonly chosen: PreviewProduct | undefined;
  readonly productId: string;
  readonly products: readonly PreviewProduct[];
  readonly rows: ReturnType<typeof layoutHomeButtons>;
  readonly section: string;
  readonly image: string;
  readonly onProduct: (id: string) => void;
}): JSX.Element {
  const ink = light ? 'text-[#17212b]' : 'text-white';
  const bubble = light ? 'bg-white text-[#17212b]' : 'bg-[#182533] text-[#e9eef4]';
  const showCard = section === 'card';
  const showHomeButtons = section === 'home' || section === 'buttons' || section === 'links';
  const bubbleHtml = showCard && chosen
    ? productCardText(toShop(chosen, image), draft.catalog.templates, undefined, draft.productCard)
    : filled;
  return (
    <aside className="glass-card space-y-3 rounded-lg p-4 xl:sticky xl:top-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm text-ink">Live preview</h2>
        <Button variant="secondary" onClick={() => setLight(!light)}>{light ? 'Dark chat' : 'Light chat'}</Button>
      </div>
      <SelectField id="studio-product" label="Preview product" value={productId} options={products.map((product) => ({ value: product.id, label: product.title }))} onChange={(event) => onProduct(event.target.value)} />
      <p className="text-xs text-ink-faint">Sample buyer Asha. {chosen?.sample ? 'Sample product, because this store has nothing to preview.' : chosen?.title}</p>
      <div className={`rounded-[28px] border p-2.5 ${light ? 'border-black/10 bg-[#d6e4ef]' : 'border-white/10 bg-[#0e1621]'}`}>
        <div className="flex items-center gap-2 border-b border-white/10 px-2 py-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-rose/40 text-xs text-ink">B</span>
          <div>
            <p className={`text-sm font-medium ${ink}`}>Black Tier Circle</p>
            <p className="text-[11px] text-[#6c9bd1]">bot</p>
          </div>
        </div>
        <div className="min-h-[420px] px-2 py-3">
          <div className={`max-w-[300px] overflow-hidden rounded-2xl rounded-bl-md text-[13.5px] leading-relaxed ${bubble}`}>
            {image ? (
              <img src={image} alt="" className="h-[132px] w-full object-cover" />
            ) : showCard ? (
              <div className="grid h-[132px] place-items-center bg-[#5a2038] text-[34px] font-medium text-[#f3d5e0]">{productInitials(chosen?.title ?? 'Sample')}</div>
            ) : null}
            <div className="px-3 py-2" dangerouslySetInnerHTML={{ __html: htmlToNodes(bubbleHtml) }} />
            <p className="px-3 pb-2 text-right text-[11px] text-[#6d8296]">18:42</p>
          </div>
          {showCard ? (
            <div className="mt-1 grid max-w-[300px] grid-cols-4 gap-1">
              {['1', '2', '5', '10'].map((qty) => <span key={qty} className="rounded-lg bg-[#2b5278]/70 py-2 text-center text-[13px] text-white">×{qty}</span>)}
            </div>
          ) : null}
          {showHomeButtons ? (
            <div className="mt-1 grid max-w-[300px] gap-1">
              {rows.map((row, index) => (
                <div key={index} className={`grid gap-1 ${row.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {row.map((button) => <span key={button.text} className="rounded-lg bg-[#2b5278]/70 px-2 py-1.5 text-center text-[13px] text-white">{button.text}</span>)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <p className="text-center text-xs text-ink-faint">Rendered with the same builder the bot uses</p>
    </aside>
  );
}

function toShop(product: PreviewProduct, imageUrl: string | null): ShopProduct {
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
    imageUrl,
  };
}

export default function BotStudioPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <StudioView />
    </Suspense>
  );
}
