import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { DEFAULT_STORE_CONFIG } from '@/modules/store-config/defaults';
import { getStoreConfig, mergeStoreConfig, saveStoreConfig } from '@/modules/store-config';
import { tenantIdForStudio, writeStudio } from '@/modules/store-config/access';
import { AuthError } from '@/lib/errors';
import { sanitizeBotHtml } from '@/modules/store-config/sanitize';
import { renderTemplate } from '@/modules/store-config/template';
import { isAllowedBotUrl } from '@/modules/store-config/urls';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const ACTOR = '00000000-0000-4000-8000-000000000002';
const TENANT = '00000000-0000-4000-8000-000000000010';

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
