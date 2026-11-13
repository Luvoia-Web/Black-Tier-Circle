'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CatalogTab } from '@/components/bot-studio/catalog-tab';
import { FormField } from '@/components/settings/FormField';
import { PageHeader } from '@/components/ui/page-header';
import { PreviewHtml } from '@/components/bot-studio/preview-html';
import { API_ROUTES } from '@/lib/navigation';
import {
  categoryToken,
  checkoutButtons,
  checkoutText,
  layoutScreenButtons,
  productCardButtons,
  productCardText,
  renderShop,
  type ShopProduct,
} from '@/modules/catalog/shop-screen';
import { layoutHomeButtons } from '@/modules/store-config/keyboard';
import { freebieListText, referralHomeText } from '@/modules/referrals/screens';
import { renderTemplate } from '@/modules/store-config/template';
import { BUTTON_KEYS, COMING_SOON_BUTTONS, PRODUCT_CARD_FIELDS, type ButtonKey, type ProductCardField, type StoreConfig } from '@/modules/store-config/types';
import { isAllowedBotUrl } from '@/modules/store-config/urls';

type Scope = 'owner' | 'reseller';

type StudioPayload = {
  readonly config: StoreConfig;
  readonly version: number;
  readonly defaults: StoreConfig;
  readonly buyerCategories?: readonly string[];
};

const TABS = ['Home', 'Buttons', 'Links', 'Messages', 'Catalog', 'Product card', 'Preview'] as const;

function cloneConfig(config: StoreConfig): StoreConfig {
  return JSON.parse(JSON.stringify(config)) as StoreConfig;
}

export function BotStudio({ scope }: { readonly scope: Scope }): JSX.Element {
  const route = scope === 'owner' ? API_ROUTES.ownerBotStudio : API_ROUTES.resellerBotStudio;
  const [draft, setDraft] = useState<StoreConfig | null>(null);
  const [saved, setSaved] = useState<StoreConfig | null>(null);
  const [defaults, setDefaults] = useState<StoreConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Home');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [conflict, setConflict] = useState(false);
  const [buyerCategories, setBuyerCategories] = useState<readonly string[]>([]);
  const [catalog, setCatalog] = useState<readonly ShopProduct[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setConflict(false);
    try {
      const response = await fetch(route);
      const body = (await response.json()) as { success: boolean; data?: StudioPayload; error?: { message: string } };
      if (!response.ok || !body.success || !body.data) {
        throw new Error(body.error?.message ?? 'Could not load Bot Studio');
      }
      setDraft(cloneConfig(body.data.config));
      setSaved(cloneConfig(body.data.config));
      setDefaults(body.data.defaults);
      setVersion(body.data.version);
      setBuyerCategories(body.data.buyerCategories ?? []);
      setCatalog(await loadStudioProducts(scope));
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load Bot Studio');
    } finally {
      setLoading(false);
    }
  }, [route, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );

  useEffect(() => {
    function warn(event: BeforeUnloadEvent): void {
      if (!dirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(): Promise<void> {
    if (!draft) {
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    setConflict(false);
    try {
      const response = await fetch(route, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: draft, version }),
      });
      const body = (await response.json()) as {
        success: boolean;
        data?: { config: StoreConfig; version: number };
        error?: { code: string; message: string };
      };
      if (response.status === 409 || body.error?.code === 'CONFIG_CONFLICT') {
        setConflict(true);
        setError('This was changed elsewhere. Reload to see the latest.');
        return;
      }
      if (!response.ok || !body.success || !body.data) {
        throw new Error(body.error?.message ?? 'Could not save');
      }
      setDraft(cloneConfig(body.data.config));
      setSaved(cloneConfig(body.data.config));
      setVersion(body.data.version);
      setSuccess('Saved. Changes go live within about 30 seconds.');
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !draft || !defaults) {
    return (
      <div>
        <PageHeader title="Bot Studio" description="Customize the Telegram home screen for this store." />
        <p className="text-sm text-[var(--text-2)]">{error || 'Loading Bot Studio…'}</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Bot Studio"
        description="Edit the welcome message, buttons, links, catalog, and key replies. Changes go live within about 30 seconds."
        actions={
          <button type="button" className="btc-btn-primary" disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        }
      />
      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-3 text-sm text-[var(--text-1)]">
          {error}
          {conflict ? (
            <button type="button" className="btc-btn-secondary ml-3" onClick={() => void load()}>
              Reload
            </button>
          ) : null}
        </div>
      ) : null}
      {success ? <p className="mb-4 text-sm text-[var(--text-1)]">{success}</p> : null}
      {dirty ? <p className="mb-4 text-sm text-[var(--text-2)]">You have unsaved changes.</p> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="btc-card p-4">
          <div className="mb-4 flex flex-wrap gap-2" role="tablist">
            {TABS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                className={`${tab === item ? 'btc-btn-primary' : 'btc-btn-secondary'} ${item === 'Preview' ? 'lg:hidden' : ''}`}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </div>
          {tab === 'Home' ? (
            <FormField
              label="Welcome message"
              multiline
              rows={12}
              value={draft.welcome}
              helper="Placeholders: {name} {store} {balance} {channel} {group} {website}. Tags: b, i, u, code, and https links."
              onChange={(welcome) => setDraft({ ...draft, welcome })}
            />
          ) : null}
          {tab === 'Home' ? (
            <button type="button" className="btc-btn-secondary mt-3" onClick={() => setDraft({ ...draft, welcome: defaults.welcome })}>
              Reset welcome
            </button>
          ) : null}
          {tab === 'Buttons' ? (
            <div className="space-y-2">
              {BUTTON_KEYS.map((key, index) => (
                <details key={key} open={index === 0} className="border-b border-[var(--border)] py-2">
                  <summary className="cursor-pointer text-sm text-[var(--text-1)]">{key}</summary>
                  <ButtonEditor buttonKey={key} draft={draft} defaults={defaults} onChange={setDraft} />
                </details>
              ))}
              <details className="border-b border-[var(--border)] py-2">
                <summary className="cursor-pointer text-sm text-[var(--text-1)]">Custom links</summary>
                <CustomLinks draft={draft} onChange={setDraft} />
              </details>
            </div>
          ) : null}
          {tab === 'Links' ? (
            <div>
              {(['channel', 'group', 'website'] as const).map((key, index) => (
                <details key={key} open={index === 0} className="mb-2 border-b border-[var(--border)] py-2">
                  <summary className="cursor-pointer text-sm capitalize text-[var(--text-1)]">{key}</summary>
                  <FormField
                    label={`${key} label`}
                    value={draft.links[key].label}
                    onChange={(label) =>
                      setDraft({ ...draft, links: { ...draft.links, [key]: { ...draft.links[key], label } } })
                    }
                  />
                  <FormField
                    label={`${key} URL`}
                    value={draft.links[key].url}
                    helper={draft.links[key].url && !isAllowedBotUrl(draft.links[key].url) ? 'Use an https:// or t.me link' : 'https:// or t.me only'}
                    onChange={(url) =>
                      setDraft({ ...draft, links: { ...draft.links, [key]: { ...draft.links[key], url } } })
                    }
                  />
                  <button
                    type="button"
                    className="btc-btn-secondary mt-2"
                    onClick={() =>
                      setDraft({ ...draft, links: { ...draft.links, [key]: defaults.links[key] } })
                    }
                  >
                    Reset {key}
                  </button>
                </details>
              ))}
            </div>
          ) : null}
          {tab === 'Messages' ? (
            <div>
              {(
                [
                  ['supportIntro', 'Support intro'],
                  ['checkoutHeader', 'Checkout header'],
                  ['orderProcessing', 'Order processing'],
                  ['orderDelivered', 'Order delivered'],
                ] as const
              ).map(([key, label], index) => (
                <details key={key} open={index === 0} className="border-b border-[var(--border)] py-2">
                  <summary className="cursor-pointer text-sm text-[var(--text-1)]">{label}</summary>
                  <FormField
                    label={label}
                    multiline
                    rows={5}
                    value={draft.messages[key]}
                    placeholder={defaults.messages[key]}
                    helper="Also supports {product} {quantity} {total} {order} {content}"
                    onChange={(value) => setDraft({ ...draft, messages: { ...draft.messages, [key]: value } })}
                  />
                  <button
                    type="button"
                    className="btc-btn-secondary mt-2"
                    onClick={() => setDraft({ ...draft, messages: { ...draft.messages, [key]: defaults.messages[key] } })}
                  >
                    Reset {label}
                  </button>
                </details>
              ))}
            </div>
          ) : null}
          {tab === 'Catalog' ? (
            <CatalogTab draft={draft} defaults={defaults} categories={buyerCategories} onChange={setDraft} />
          ) : null}
          {tab === 'Product card' ? (
            <ProductCardTab draft={draft} defaults={defaults} onChange={setDraft} />
          ) : null}
          {tab === 'Preview' ? (
            <div className="lg:hidden">
              <TelegramPreview config={draft} categories={buyerCategories} catalog={catalog} />
            </div>
          ) : null}
          <div className="sticky bottom-0 mt-4 border-t border-[var(--border)] bg-[var(--bg-card)] py-3">
            <button type="button" className="btc-btn-primary" disabled={saving || !dirty} onClick={() => void save()}>
              {saving ? 'Saving…' : dirty ? 'Save unsaved changes' : 'Saved'}
            </button>
          </div>
        </section>
        <div className="hidden lg:block">
          <TelegramPreview config={draft} categories={buyerCategories} catalog={catalog} />
        </div>
      </div>
    </div>
  );
}

function ButtonEditor({
  buttonKey,
  draft,
  defaults,
  onChange,
}: {
  readonly buttonKey: ButtonKey;
  readonly draft: StoreConfig;
  readonly defaults: StoreConfig;
  readonly onChange: (next: StoreConfig) => void;
}): JSX.Element {
  const button = draft.buttons[buttonKey];
  const comingSoon = COMING_SOON_BUTTONS.has(buttonKey);
  function patch(next: Partial<StoreConfig['buttons'][ButtonKey]>): void {
    onChange({
      ...draft,
      buttons: { ...draft.buttons, [buttonKey]: { ...button, ...next } },
    });
  }
  return (
    <fieldset className="rounded-lg border border-[var(--border)] p-3">
      <legend className="px-1 text-sm text-[var(--text-1)]">
        {buttonKey}
        {comingSoon ? ' — Coming soon' : ''}
      </legend>
      <label className="mt-2 flex items-center gap-2 text-sm text-[var(--text-2)]">
        <input
          type="checkbox"
          checked={comingSoon ? false : button.enabled}
          disabled={comingSoon}
          onChange={(event) => patch({ enabled: event.target.checked })}
        />
        Show on the home screen
      </label>
      {buttonKey === 'referrals' || buttonKey === 'freebies' ? (
        <p className="mt-2 text-xs text-[var(--text-3)]">Shown after this store turns that feature on.</p>
      ) : null}
      <FormField label="Label" value={button.label} onChange={(label) => patch({ label })} />
      <FormField label="Emoji" value={button.emoji} onChange={(emoji) => patch({ emoji })} />
      <label className="mt-3 block text-sm text-[var(--text-2)]">
        Width
        <select
          className="btc-input mt-1"
          value={button.width}
          onChange={(event) => patch({ width: event.target.value === 'half' ? 'half' : 'full' })}
        >
          <option value="full">Full</option>
          <option value="half">Half</option>
        </select>
      </label>
      <FormField label="Order" value={String(button.order)} onChange={(value) => patch({ order: Number(value) || 0 })} />
      <button
        type="button"
        className="btc-btn-secondary mt-2"
        onClick={() => onChange({ ...draft, buttons: { ...draft.buttons, [buttonKey]: defaults.buttons[buttonKey] } })}
      >
        Reset {buttonKey}
      </button>
    </fieldset>
  );
}

function CustomLinks({
  draft,
  onChange,
}: {
  readonly draft: StoreConfig;
  readonly onChange: (next: StoreConfig) => void;
}): JSX.Element {
  return (
    <div>
      <h3 className="text-sm text-[var(--text-1)]">Custom links</h3>
      <p className="text-sm text-[var(--text-2)]">Up to 3. Each opens an https:// or t.me URL.</p>
      {draft.customLinks.map((link, index) => (
        <div key={`${link.label}-${index}`} className="mt-2">
          <FormField
            label={`Link ${index + 1} label`}
            value={link.label}
            onChange={(label) => {
              const customLinks = draft.customLinks.map((item, itemIndex) => (itemIndex === index ? { ...item, label } : item));
              onChange({ ...draft, customLinks });
            }}
          />
          <FormField
            label={`Link ${index + 1} URL`}
            value={link.url}
            {...(link.url && !isAllowedBotUrl(link.url) ? { helper: 'Use an https:// or t.me link' } : {})}
            onChange={(url) => {
              const customLinks = draft.customLinks.map((item, itemIndex) => (itemIndex === index ? { ...item, url } : item));
              onChange({ ...draft, customLinks });
            }}
          />
          <button
            type="button"
            className="btc-btn-secondary mt-2"
            onClick={() => onChange({ ...draft, customLinks: draft.customLinks.filter((_, itemIndex) => itemIndex !== index) })}
          >
            Remove
          </button>
        </div>
      ))}
      {draft.customLinks.length < 3 ? (
        <button
          type="button"
          className="btc-btn-secondary mt-3"
          onClick={() => onChange({ ...draft, customLinks: [...draft.customLinks, { label: 'Website', url: 'https://', emoji: '🔗' }] })}
        >
          Add link
        </button>
      ) : null}
    </div>
  );
}

const PREVIEW_SCREENS = ['Home', 'Shop', 'Category', 'Product', 'Checkout', 'Refer & Earn', 'Freebies'] as const;

function minorOf(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  return 0n;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toShopProduct(row: Record<string, unknown>, price: unknown): ShopProduct | null {
  if (typeof row.id !== 'string' || typeof row.title !== 'string') {
    return null;
  }
  const delivery = row.deliveryType === 'supplier_api' || row.deliveryType === 'manual' || row.deliveryType === 'file_reusable' ? row.deliveryType : 'inventory_unit';
  return {
    id: row.id,
    title: row.title,
    category: typeof row.category === 'string' ? row.category : null,
    priceMinor: minorOf(price),
    stockUnlimited: row.stockUnlimited === true,
    stockCount: typeof row.stockCount === 'number' ? row.stockCount : null,
    soldCount: typeof row.salesCount === 'number' ? row.salesCount : typeof row.soldCount === 'number' ? row.soldCount : null,
    description: typeof row.description === 'string' ? row.description : null,
    durationText: typeof row.durationText === 'string' ? row.durationText : null,
    warrantyText: typeof row.warrantyText === 'string' ? row.warrantyText : null,
    typeLabel: typeof row.typeLabel === 'string' ? row.typeLabel : null,
    deliveryType: delivery,
    requiresEmailActivation: row.requiresEmailActivation === true,
    imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : null,
  };
}

async function loadStudioProducts(scope: Scope): Promise<ShopProduct[]> {
  try {
    const response = await fetch(
      scope === 'owner' ? `${API_ROUTES.products}?status=published&limit=24` : API_ROUTES.resellerListings,
    );
    const body = (await response.json()) as { success?: boolean; data?: { products?: unknown[]; listings?: unknown[] } };
    if (!response.ok || !body.success || !body.data) {
      return [];
    }
    const source = scope === 'owner' ? (body.data.products ?? []) : (body.data.listings ?? []);
    return source.flatMap((row) => {
      const record = asRecord(row);
      if (!record) {
        return [];
      }
      const product = scope === 'owner' ? record : asRecord(record.product);
      if (!product) {
        return [];
      }
      const mapped = toShopProduct(product, scope === 'owner' ? record.retailPriceMinor : (record.retailPriceMinor ?? product.retailPriceMinor));
      return mapped ? [mapped] : [];
    });
  } catch {
    return [];
  }
}

function ProductCardTab({
  draft,
  defaults,
  onChange,
}: {
  readonly draft: StoreConfig;
  readonly defaults: StoreConfig;
  readonly onChange: (config: StoreConfig) => void;
}): JSX.Element {
  const card = draft.productCard;
  function setCard(next: StoreConfig['productCard']): void {
    onChange({ ...draft, productCard: next });
  }
  function toggle(field: ProductCardField): void {
    const fields = card.fields.includes(field) ? card.fields.filter((item) => item !== field) : [...card.fields, field];
    if (fields.length === 0) {
      return;
    }
    setCard({ ...card, fields });
  }
  function move(field: ProductCardField, direction: -1 | 1): void {
    const fields = [...card.fields];
    const index = fields.indexOf(field);
    const target = index + direction;
    const swapped = fields[target];
    if (index < 0 || !swapped) {
      return;
    }
    fields[index] = swapped;
    fields[target] = field;
    setCard({ ...card, fields });
  }
  return (
    <div>
      <details open className="border-b border-[var(--border)] py-2">
        <summary className="cursor-pointer text-sm text-[var(--text-1)]">Fields and order</summary>
        {PRODUCT_CARD_FIELDS.map((field) => (
          <div key={field} className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--text-1)]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={card.fields.includes(field)} onChange={() => toggle(field)} />
              {field}
            </label>
            <button type="button" className="btc-btn-secondary" onClick={() => move(field, -1)}>
              Up
            </button>
            <button type="button" className="btc-btn-secondary" onClick={() => move(field, 1)}>
              Down
            </button>
          </div>
        ))}
      </details>
      <details className="border-b border-[var(--border)] py-2">
        <summary className="cursor-pointer text-sm text-[var(--text-1)]">Image</summary>
        <label className="mt-2 flex items-center gap-2 text-sm text-[var(--text-1)]">
          <input type="checkbox" checked={card.showImage} onChange={(event) => setCard({ ...card, showImage: event.target.checked })} />
          Show the product image
        </label>
        <FormField label="Fallback emoji" value={card.fallbackEmoji} onChange={(fallbackEmoji) => setCard({ ...card, fallbackEmoji })} />
        <button type="button" className="btc-btn-secondary mt-2" onClick={() => setCard(defaults.productCard)}>
          Reset product card
        </button>
      </details>
    </div>
  );
}

function sampleProduct(id: string, category: string | null, soldOut = false): ShopProduct {
  return {
    id,
    title: category ? 'Sample product' : 'Uncategorised item',
    category,
    priceMinor: 5_000_000n,
    stockUnlimited: false,
    stockCount: soldOut ? 0 : 8,
    soldCount: 3,
    description: 'A sample description for this store. '.repeat(8),
    durationText: '12 months',
    warrantyText: '30 days',
    typeLabel: null,
    deliveryType: 'inventory_unit',
    requiresEmailActivation: false,
  };
}

function buttonClass(style?: 'success' | 'danger'): string {
  const base = 'flex-1 rounded-lg px-2 py-2 text-center text-xs text-[var(--text-1)]';
  if (style === 'success') {
    return `${base} border border-[var(--green)] bg-[var(--bg-card)]`;
  }
  if (style === 'danger') {
    return `${base} border border-[var(--red)] bg-[var(--bg-card)]`;
  }
  return `${base} bg-[var(--bg-card)]`;
}

function TelegramPreview({
  config,
  categories,
  catalog,
}: {
  readonly config: StoreConfig;
  readonly categories: readonly string[];
  readonly catalog: readonly ShopProduct[];
}): JSX.Element {
  const [screen, setScreen] = useState<(typeof PREVIEW_SCREENS)[number]>('Home');
  const [productId, setProductId] = useState('');
  const channel = config.links.channel.url ? `${config.links.channel.label}: ${config.links.channel.url}` : '';
  const group = config.links.group.url ? `${config.links.group.label}: ${config.links.group.url}` : '';
  const website = config.links.website.url ? `${config.links.website.label}: ${config.links.website.url}` : '';
  const usingSample = catalog.length === 0;
  const names = categories.length > 0 ? categories.slice(0, 4) : ['Sample category'];
  const products = usingSample
    ? [...names.map((name, index) => sampleProduct(`sample-${index}`, name, index === 1)), sampleProduct('loose', null)]
    : catalog;
  const firstName = products[0]?.category ?? names[0] ?? 'Sample category';
  const chosen = products.find((item) => item.id === productId) ?? products[0] ?? sampleProduct('card', firstName);
  let html = '';
  let rows: ReadonlyArray<ReadonlyArray<{ readonly text: string; readonly style?: 'success' | 'danger' }>> = [];
  if (screen === 'Home') {
    html = renderTemplate(config.welcome, {
      name: 'Alex',
      store: 'Your store',
      balance: '12.50 USDT',
      channel,
      group,
      website,
    }).replace(/\n{3,}/g, '\n\n');
    rows = layoutHomeButtons(config, { resellerSignupEnabled: true });
  } else if (screen === 'Shop') {
    const view = renderShop({
      products,
      settings: config.catalog.categories,
      templates: config.catalog.templates,
    });
    html = view.text;
    rows = view.rows;
  } else if (screen === 'Category') {
    const view = renderShop({
      products,
      settings: config.catalog.categories,
      templates: config.catalog.templates,
      categoryToken: categoryToken(firstName),
    });
    html = view.text;
    rows = view.rows;
  } else if (screen === 'Product') {
    html = productCardText(chosen, config.catalog.templates, undefined, config.productCard);
    rows = layoutScreenButtons(productCardButtons(chosen));
  } else if (screen === 'Refer & Earn') {
    html = referralHomeText({
      template: config.referrals.templates.home,
      link: 'https://t.me/store_bot?start=ref_abcdefghjkmn',
      invited: 3,
      pending: 1,
      qualified: 2,
      points: 2,
      walletMinor: 400_000n,
      nextLine: '1 more qualified friend to unlock Bonus guide',
    });
    rows = config.referrals.enabled ? [[{ text: 'Share' }], [{ text: 'Redeem' }], [{ text: 'Freebies' }], [{ text: 'Home' }]] : [[{ text: 'Home' }]];
  } else if (screen === 'Freebies') {
    html = freebieListText(config.referrals.templates.freebies, [
      { id: 'sample-locked', title: 'Bonus guide', required: 2, unlocked: false },
      { id: 'sample-open', title: 'Welcome link', required: 0, unlocked: true },
    ]);
    rows = [[{ text: 'Welcome link' }], [{ text: 'Back' }, { text: 'Home' }]];
  } else {
    html = checkoutText({
      title: config.messages.checkoutHeader,
      productTitle: chosen.title,
      quantity: 1,
      warranty: chosen.warrantyText ?? '30 days',
      totalMinor: chosen.priceMinor,
      balanceMinor: 0n,
      windowLine: 'You have 15 minutes to complete this payment.',
      shortfallTemplate: config.catalog.templates.checkoutShortfall,
      minimumDepositMinor: 1_000_000n,
    });
    rows = layoutScreenButtons(
      checkoutButtons({
        orderId: 'sample',
        productId: chosen.id,
        totalMinor: chosen.priceMinor,
        balanceMinor: 0n,
        minimumDepositMinor: 1_000_000n,
        binance: true,
        bep20: true,
        trc20: false,
        demo: false,
      }),
    );
  }
  return (
    <aside className="btc-card p-4" aria-label="Telegram preview">
      <p className="mb-3 text-sm text-[var(--text-2)]">Preview</p>
      {usingSample ? <p className="mb-3 text-sm text-[var(--text-2)]">Sample data. This store has no products yet.</p> : null}
      <label className="mb-3 block text-sm text-[var(--text-2)]">
        Product
        <select className="btc-input mt-1 w-full" value={chosen.id} onChange={(event) => setProductId(event.target.value)}>
          {products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Preview screen">
        {PREVIEW_SCREENS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={screen === item}
            className={screen === item ? 'btc-btn-primary' : 'btc-btn-secondary'}
            onClick={() => setScreen(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="rounded-2xl bg-[var(--bg-raised)] p-3 text-sm text-[var(--text-1)]">
        {screen === 'Product' && config.productCard.showImage && config.productCard.fields.includes('image') && chosen.imageUrl ? (
          // Supplier image hosts are not in the Next image allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chosen.imageUrl} alt="" className="mb-3 h-24 w-24 rounded-lg object-cover" />
        ) : null}
        <PreviewHtml html={html} />
        <div className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex gap-2">
              {row.map((button) => (
                <span key={button.text} className={buttonClass('style' in button ? button.style : undefined)}>
                  {button.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--text-3)]">Sample buyer. Your store name and products are used in Telegram.</p>
    </aside>
  );
}
