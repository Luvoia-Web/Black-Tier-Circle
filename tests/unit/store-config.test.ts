import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { DEFAULT_STORE_CONFIG } from '@/modules/store-config/defaults';
import { getStoreConfig, mergeStoreConfig, parseStoreConfig, saveStoreConfig } from '@/modules/store-config';
import { tenantIdForStudio, writeStudio } from '@/modules/store-config/access';
import { AuthError } from '@/lib/errors';
import { sanitizeBotHtml } from '@/modules/store-config/sanitize';
import { renderTemplate } from '@/modules/store-config/template';
import { layoutHomeButtons } from '@/modules/store-config/keyboard';
import { isAllowedBotUrl } from '@/modules/store-config/urls';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const ACTOR = '00000000-0000-4000-8000-000000000002';
const TENANT = '00000000-0000-4000-8000-000000000010';

describe('home keyboard', () => {
  it('orders buttons, pairs half widths, and hides coming-soon and disabled keys', () => {
    const rows = layoutHomeButtons(
      {
        ...DEFAULT_STORE_CONFIG,
        buttons: {
          ...DEFAULT_STORE_CONFIG.buttons,
          api: { ...DEFAULT_STORE_CONFIG.buttons.api, enabled: true },
          terms: { ...DEFAULT_STORE_CONFIG.buttons.terms, enabled: false },
        },
        customLinks: [{ label: 'Want a bot like this?', url: 't.me/rentals', emoji: '🤖' }],
      },
      { resellerSignupEnabled: false },
    );
    const flat = rows.flat();
    expect(flat.map((button) => button.text)).toEqual([
      '🛍 Browse Shop',
      '💳 Deposit',
      '👤 Profile',
      '❓ Support',
      '🔑 My API',
      '🤖 Want a bot like this?',
    ]);
    expect(rows[0]).toHaveLength(1);
    expect(rows[1]?.map((button) => button.text)).toEqual(['💳 Deposit', '👤 Profile']);
    expect(flat.some((button) => button.text.includes('Freebies') || button.text.includes('Referral') || button.text.includes('Refer &'))).toBe(false);
    expect(flat.at(-1)).toMatchObject({ kind: 'url', url: 'https://t.me/rentals' });
  });

  it('shows Refer and Freebies only when that store turned them on', () => {
    const rows = layoutHomeButtons(
      {
        ...DEFAULT_STORE_CONFIG,
        referrals: { ...DEFAULT_STORE_CONFIG.referrals, enabled: true, freebiesEnabled: true },
      },
      { resellerSignupEnabled: false },
    );
    const texts = rows.flat().map((button) => button.text);
    expect(texts).toContain('🎁 Refer & Earn');
    expect(texts).toContain('🎁 Freebies');
  });
});

describe('bot html sanitizer', () => {
  it('keeps allowed tags and strips scripts, handlers, and javascript links', () => {
    expect(sanitizeBotHtml('<b>Hi</b> <i>there</i>')).toBe('<b>Hi</b> <i>there</i>');
    expect(sanitizeBotHtml('<script>alert(1)</script><b>Ok</b>')).toBe('alert(1)<b>Ok</b>');
    expect(sanitizeBotHtml('<b onclick="alert(1)">Hi</b>')).toBe('<b>Hi</b>');
    expect(sanitizeBotHtml('<a href="javascript:alert(1)">x</a>')).toBe('x');
    expect(sanitizeBotHtml('<a href="https://shop.example">Shop</a>')).toBe(
      '<a href="https://shop.example">Shop</a>',
    );
    expect(sanitizeBotHtml('<img src=x onerror=alert(1)>')).toBe('');
    expect(sanitizeBotHtml('<blockquote expandable>More</blockquote>')).toBe('<blockquote expandable>More</blockquote>');
  });

  it('balances an unclosed tag and escapes a broken close', () => {
    expect(sanitizeBotHtml('<b>Hi')).toBe('<b>Hi</b>');
    expect(sanitizeBotHtml('</b><i>Hi</i>')).toBe('<i>Hi</i>');
  });
});

describe('renderTemplate', () => {
  it('escapes values and leaves unknown placeholders', () => {
    const text = renderTemplate('Hello <b>{name}</b> {unknown}', { name: '<Alex>' });
    expect(text).toBe('Hello <b>&lt;Alex&gt;</b> {unknown}');
  });
});

describe('store config', () => {
  it('rejects bad urls, long text, extra links, and unknown keys', async () => {
    expect(isAllowedBotUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedBotUrl('data:text/html,hi')).toBe(false);
    expect(isAllowedBotUrl('http://example.com')).toBe(false);
    expect(isAllowedBotUrl('https://example.com/rent')).toBe(true);
    expect(isAllowedBotUrl('t.me/store')).toBe(true);
    const tooMany = {
      ...DEFAULT_STORE_CONFIG,
      customLinks: [1, 2, 3, 4].map((item) => ({ label: `L${item}`, url: 'https://example.com', emoji: '' })),
    };
    await expect(saveStoreConfig(createMemoryDb(), null, tooMany, ACTOR, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(
      saveStoreConfig(
        createMemoryDb(),
        null,
        { ...DEFAULT_STORE_CONFIG, welcome: 'x'.repeat(2001), extra: true },
        ACTOR,
        0,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('merges stored fields over defaults', () => {
    const merged = mergeStoreConfig({ welcome: 'Hello {name}', buttons: { shop: { label: 'Catalog' } } });
    expect(merged.welcome).toBe('Hello {name}');
    expect(merged.buttons.shop.label).toBe('Catalog');
    expect(merged.buttons.deposit.label).toBe(DEFAULT_STORE_CONFIG.buttons.deposit.label);
    expect(merged.messages.supportIntro).toBe(DEFAULT_STORE_CONFIG.messages.supportIntro);
  });

  it('fills catalog defaults for an old row and keeps a valid category', () => {
    const merged = mergeStoreConfig({
      welcome: 'Hello {name}',
      catalog: {
        categories: {
          Games: { emoji: '🎮', displayName: 'Games', description: 'Keys', sortOrder: 2, hidden: false },
          Bad: { emoji: 'x'.repeat(20), sortOrder: 1, hidden: false, displayName: '', description: '' },
        },
        templates: { categoriesHeader: '   ', productFooterInstant: 'Ships itself.' },
      },
    });
    expect(merged.catalog.templates.categoriesHeader).toBe(DEFAULT_STORE_CONFIG.catalog.templates.categoriesHeader);
    expect(merged.catalog.templates.productFooterInstant).toBe('Ships itself.');
    expect(merged.catalog.templates.checkoutShortfall).toBe(DEFAULT_STORE_CONFIG.catalog.templates.checkoutShortfall);
    expect(merged.catalog.categories.Games).toMatchObject({ emoji: '🎮', sortOrder: 2, hidden: false });
    expect(merged.catalog.categories.Bad).toBeUndefined();
    expect(mergeStoreConfig({ welcome: 'Hello' }).catalog.categories).toEqual({});
    expect(mergeStoreConfig({ welcome: 'Hello' }).referrals).toEqual(DEFAULT_STORE_CONFIG.referrals);
    expect(mergeStoreConfig({ welcome: 'Hello' }).referrals.enabled).toBe(false);
  });

  it('returns defaults when no row exists and rejects a stale version', async () => {
    const db = createMemoryDb();
    const first = await getStoreConfig(db, null);
    expect(first.source).toBe('default');
    expect(first.version).toBe(0);
    const saved = await saveStoreConfig(db, null, DEFAULT_STORE_CONFIG, ACTOR, 0);
    expect(saved.version).toBe(1);
    expect(db.tables.audit_log).toHaveLength(1);
    await expect(saveStoreConfig(db, null, DEFAULT_STORE_CONFIG, ACTOR, 0)).rejects.toMatchObject({
      code: 'CONFIG_CONFLICT',
    });
    const again = await saveStoreConfig(db, TENANT, { ...DEFAULT_STORE_CONFIG, welcome: 'Reseller hello {name}' }, ACTOR, 0);
    expect(again.version).toBe(1);
    const owner = await getStoreConfig(db, null);
    const reseller = await getStoreConfig(db, TENANT);
    expect(owner.config.welcome).toBe(DEFAULT_STORE_CONFIG.welcome);
    expect(reseller.config.welcome).toBe('Reseller hello {name}');
    expect(owner.config).not.toEqual(reseller.config);
  });

  it('keeps a reseller on their own tenant even if the body names another store', async () => {
    const db = createMemoryDb();
    expect(tenantIdForStudio('owner', TENANT)).toBeNull();
    expect(tenantIdForStudio('reseller', TENANT)).toBe(TENANT);
    expect(() => tenantIdForStudio('reseller', null)).toThrow(AuthError);
    const other = '00000000-0000-4000-8000-000000000099';
    await writeStudio(
      db,
      'reseller',
      TENANT,
      { config: DEFAULT_STORE_CONFIG, version: 0, tenantId: null, otherTenantId: other },
      ACTOR,
    );
    const owner = await getStoreConfig(db, null);
    const reseller = await getStoreConfig(db, TENANT);
    const stranger = await getStoreConfig(db, other);
    expect(owner.source).toBe('default');
    expect(stranger.source).toBe('default');
    expect(reseller.source).toBe('stored');
  });
});

describe('product card config', () => {
  it('round-trips a card and rejects a field that is not on the card', () => {
    const stored = mergeStoreConfig({
      welcome: 'Hello {name}',
      productCard: { fields: ['price', 'name'], showImage: false, fallbackEmoji: '🎁' },
    });
    expect(stored.productCard).toEqual({ fields: ['price', 'name'], showImage: false, fallbackEmoji: '🎁' });
    const parsed = parseStoreConfig({ ...DEFAULT_STORE_CONFIG, productCard: stored.productCard });
    expect(parsed.productCard.fields).toEqual(['price', 'name']);
    expect(() =>
      parseStoreConfig({
        ...DEFAULT_STORE_CONFIG,
        productCard: { fields: ['price', 'nope'], showImage: true, fallbackEmoji: '📦' },
      }),
    ).toThrow(ValidationError);
    expect(mergeStoreConfig({ welcome: 'Hello {name}', productCard: { fields: [] } }).productCard).toEqual(
      DEFAULT_STORE_CONFIG.productCard,
    );
  });
});
