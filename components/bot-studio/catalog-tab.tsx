'use client';

import { FormField } from '@/components/settings/FormField';
import type { CatalogCategorySetting, CatalogTemplates, StoreConfig } from '@/modules/store-config/types';

const TEMPLATE_FIELDS: ReadonlyArray<{
  readonly key: keyof CatalogTemplates;
  readonly label: string;
  readonly helper: string;
}> = [
  {
    key: 'categoriesHeader',
    label: 'Categories header',
    helper: 'Title and the short line on the shop screen.',
  },
  {
    key: 'productListHeader',
    label: 'Product list header',
    helper: 'Placeholders: {emoji} {name} {description} {count}',
  },
  {
    key: 'productFooterInstant',
    label: 'Instant product footer',
    helper: 'Shown under products that are delivered automatically.',
  },
  {
    key: 'productFooterManual',
    label: 'Manual and activation footer',
    helper: 'Shown for manual delivery and activation links.',
  },
  {
    key: 'checkoutShortfall',
    label: 'Checkout shortfall',
    helper: 'Placeholder: {shortfall}',
  },
  {
    key: 'bulkDiscountHeading',
    label: 'Bulk discount heading',
    helper: 'Shown on the product card when tiers exist.',
  },
  {
    key: 'bulkQuantityHeading',
    label: 'Quantity discount heading',
    helper: 'Shown on the quantity screen when tiers exist.',
  },
  {
    key: 'bulkTierLine',
    label: 'Bulk tier line',
    helper: 'Placeholders: {min} {price}. Price is filled by the pricing function.',
  },
  {
    key: 'bulkSavingsLine',
    label: 'Bulk savings line',
    helper: 'Placeholders: {qty} {unit} {total} {savings}. Shown only when a tier applies.',
  },
];

const EMPTY_CATEGORY: CatalogCategorySetting = {
  emoji: '',
  displayName: '',
  description: '',
  sortOrder: 0,
  hidden: false,
};

export function CatalogTab({
  draft,
  defaults,
  categories,
  onChange,
}: {
  readonly draft: StoreConfig;
  readonly defaults: StoreConfig;
  readonly categories: readonly string[];
  readonly onChange: (next: StoreConfig) => void;
}): JSX.Element {
  function setting(name: string): CatalogCategorySetting {
    return draft.catalog.categories[name] ?? EMPTY_CATEGORY;
  }

  function patchCategory(name: string, next: Partial<CatalogCategorySetting>): void {
    onChange({
      ...draft,
      catalog: {
        ...draft.catalog,
        categories: {
          ...draft.catalog.categories,
          [name]: { ...setting(name), ...next },
        },
      },
    });
  }

  function patchTemplate(key: keyof CatalogTemplates, value: string): void {
    onChange({
      ...draft,
      catalog: {
        ...draft.catalog,
        templates: { ...draft.catalog.templates, [key]: value },
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm text-[var(--text-1)]">Categories</h3>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          One setting for each category on this store&apos;s products. Products with no category stay on the first shop
          screen and have no settings here.
        </p>
        {categories.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-2)]">No categories yet. Add a category on a product first.</p>
        ) : (
          categories.map((name) => {
            const current = setting(name);
            return (
              <fieldset key={name} className="mt-3 rounded-lg border border-[var(--border)] p-3">
                <legend className="px-1 text-sm text-[var(--text-1)]">{name}</legend>
                <FormField
                  label="Emoji"
                  value={current.emoji}
                  placeholder="📂"
                  helper="Optional. One emoji, up to 8 characters."
                  onChange={(emoji) => patchCategory(name, { emoji: emoji.slice(0, 8) })}
                />
                <FormField
                  label="Display name"
                  value={current.displayName}
                  placeholder={name}
                  helper="Optional. The category name is used when this is blank."
                  onChange={(displayName) => patchCategory(name, { displayName: displayName.slice(0, 40) })}
                />
                <FormField
                  label="Description"
                  value={current.description}
                  placeholder="One short line"
                  helper="Optional. One line under the category title."
                  onChange={(description) => patchCategory(name, { description: description.slice(0, 120) })}
                />
                <FormField
                  label="Sort order"
                  value={String(current.sortOrder)}
                  helper="Lower numbers appear first."
                  onChange={(value) => {
                    const parsed = Number(value);
                    patchCategory(name, { sortOrder: Number.isInteger(parsed) ? Math.min(999, Math.max(0, parsed)) : 0 });
                  }}
                />
                <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-2)]">
                  <input
                    type="checkbox"
                    checked={current.hidden}
                    onChange={(event) => patchCategory(name, { hidden: event.target.checked })}
                  />
                  Hide this category
                </label>
                <button
                  type="button"
                  className="btc-btn-secondary mt-3"
                  onClick={() =>
                    onChange({
                      ...draft,
                      catalog: {
                        ...draft.catalog,
                        categories: { ...draft.catalog.categories, [name]: defaults.catalog.categories[name] ?? EMPTY_CATEGORY },
                      },
                    })
                  }
                >
                  Reset {name}
                </button>
              </fieldset>
            );
          })
        )}
      </div>
      <div>
        <h3 className="text-sm text-[var(--text-1)]">Templates</h3>
        {TEMPLATE_FIELDS.map((field) => (
          <div key={field.key}>
            <FormField
              label={field.label}
              multiline
              rows={4}
              value={draft.catalog.templates[field.key]}
              placeholder={defaults.catalog.templates[field.key]}
              helper={field.helper}
              onChange={(value) => patchTemplate(field.key, value)}
            />
            <button
              type="button"
              className="btc-btn-secondary mt-2"
              onClick={() => patchTemplate(field.key, defaults.catalog.templates[field.key])}
            >
              Reset {field.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
