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
import { renderTemplate } from '@/modules/store-config/template';
import { BUTTON_KEYS, COMING_SOON_BUTTONS, type ButtonKey, type StoreConfig } from '@/modules/store-config/types';
import { isAllowedBotUrl } from '@/modules/store-config/urls';

type Scope = 'owner' | 'reseller';

type StudioPayload = {
  readonly config: StoreConfig;
  readonly version: number;
  readonly defaults: StoreConfig;
  readonly buyerCategories?: readonly string[];
};

const TABS = ['Home', 'Buttons', 'Links', 'Messages', 'Catalog'] as const;

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
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load Bot Studio');
    } finally {
      setLoading(false);
    }
  }, [route]);

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
                className={tab === item ? 'btc-btn-primary' : 'btc-btn-secondary'}
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
            <div className="space-y-4">
              {BUTTON_KEYS.map((key) => (
                <ButtonEditor
                  key={key}
                  buttonKey={key}
                  draft={draft}
                  defaults={defaults}
                  onChange={setDraft}
                />
              ))}
              <CustomLinks draft={draft} onChange={setDraft} />
            </div>
          ) : null}
          {tab === 'Links' ? (
            <div>
              {(['channel', 'group', 'website'] as const).map((key) => (
                <div key={key} className="mb-4">
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
                </div>
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
              ).map(([key, label]) => (
                <div key={key}>
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
                </div>
              ))}
            </div>
          ) : null}
          {tab === 'Catalog' ? (
            <CatalogTab draft={draft} defaults={defaults} categories={buyerCategories} onChange={setDraft} />
          ) : null}
        </section>
        <TelegramPreview config={draft} categories={buyerCategories} />
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

const PREVIEW_SCREENS = ['Home', 'Shop', 'Category', 'Product', 'Checkout'] as const;

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
}: {
  readonly config: StoreConfig;
  readonly categories: readonly string[];
}): JSX.Element {
  const [screen, setScreen] = useState<(typeof PREVIEW_SCREENS)[number]>('Home');
  const channel = config.links.channel.url ? `${config.links.channel.label}: ${config.links.channel.url}` : '';
  const group = config.links.group.url ? `${config.links.group.label}: ${config.links.group.url}` : '';
  const website = config.links.website.url ? `${config.links.website.label}: ${config.links.website.url}` : '';
  const names = categories.length > 0 ? categories.slice(0, 4) : ['Sample category'];
  const products = [
    ...names.map((name, index) => sampleProduct(`sample-${index}`, name, index === 1)),
    sampleProduct('loose', null),
  ];
  const firstName = names[0] ?? 'Sample category';
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
    const sample = sampleProduct('card', firstName);
    html = productCardText(sample, config.catalog.templates);
    rows = layoutScreenButtons(productCardButtons(sample));
  } else {
    html = checkoutText({
      title: config.messages.checkoutHeader,
      productTitle: 'Sample product',
      quantity: 1,
      warranty: '30 days',
      totalMinor: 400_000n,
      balanceMinor: 0n,
      windowLine: 'You have 15 minutes to complete this payment.',
      shortfallTemplate: config.catalog.templates.checkoutShortfall,
      minimumDepositMinor: 1_000_000n,
    });
    rows = layoutScreenButtons(
      checkoutButtons({
        orderId: 'sample',
        productId: 'card',
        totalMinor: 400_000n,
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
