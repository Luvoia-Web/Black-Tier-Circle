'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormField } from '@/components/settings/FormField';
import { PageHeader } from '@/components/ui/page-header';
import { PreviewHtml } from '@/components/bot-studio/preview-html';
import { API_ROUTES } from '@/lib/navigation';
import { layoutHomeButtons } from '@/modules/store-config/keyboard';
import { renderTemplate } from '@/modules/store-config/template';
import { BUTTON_KEYS, COMING_SOON_BUTTONS, type ButtonKey, type StoreConfig } from '@/modules/store-config/types';
import { isAllowedBotUrl } from '@/modules/store-config/urls';

type Scope = 'owner' | 'reseller';

type StudioPayload = {
  readonly config: StoreConfig;
  readonly version: number;
  readonly defaults: StoreConfig;
};

const TABS = ['Home', 'Buttons', 'Links', 'Messages'] as const;

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
        description="Edit the welcome message, buttons, links, and key replies. Changes go live within about 30 seconds."
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
        </section>
        <TelegramPreview config={draft} />
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

function TelegramPreview({ config }: { readonly config: StoreConfig }): JSX.Element {
  const channel = config.links.channel.url ? `${config.links.channel.label}: ${config.links.channel.url}` : '';
  const group = config.links.group.url ? `${config.links.group.label}: ${config.links.group.url}` : '';
  const website = config.links.website.url ? `${config.links.website.label}: ${config.links.website.url}` : '';
  const html = renderTemplate(config.welcome, {
    name: 'Alex',
    store: 'Your store',
    balance: '$12.50',
    channel,
    group,
    website,
  }).replace(/\n{3,}/g, '\n\n');
  const rows = layoutHomeButtons(config, { resellerSignupEnabled: true });
  return (
    <aside className="btc-card p-4" aria-label="Telegram preview">
      <p className="mb-3 text-sm text-[var(--text-2)]">Preview</p>
      <div className="rounded-2xl bg-[var(--bg-raised)] p-3 text-sm text-[var(--text-1)]">
        <PreviewHtml html={html} />
        <div className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex gap-2">
              {row.map((button) => (
                <span
                  key={button.text}
                  className="flex-1 rounded-lg bg-[var(--bg-card)] px-2 py-2 text-center text-xs text-[var(--text-1)]"
                >
                  {button.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
